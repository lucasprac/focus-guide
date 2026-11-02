#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <array>
#include <vector>

// No raw input leaves this process. Key state is transient and used only to suppress repeats.
// The foreground window's title and program name leave only in reply to a "window" command (TypeSafe window check).
static HWND window;
static HANDLE parentProcess;
static DWORD parentPid;
static HWND lastForeground = nullptr;
static unsigned long long switches = 0;
static bool collecting = false, moved = false;
static int epoch = 0;
static unsigned long long started = 0, boundary = 0, keys = 0, clicks = 0, scrolls = 0;
static std::array<bool, 256> down{};
static UINT hotModifiers = 0, hotKey = 0;
static void emitSample() {
  if (!collecting) return;
  auto now = GetTickCount64(), duration = now - boundary;
  if (duration) std::cout << "{\"type\":\"sample\",\"epoch\":" << epoch << ",\"endMs\":" << now - started
    << ",\"durationMs\":" << duration << ",\"keys\":" << keys << ",\"clicks\":" << clicks
    << ",\"scrolls\":" << scrolls << ",\"movementMs\":" << (moved ? duration : 0) << ",\"switches\":" << switches << "}" << std::endl;
  boundary = now; keys = clicks = scrolls = switches = 0; moved = false;
}
static void sampleForeground() {
  if (!collecting) return;
  HWND foreground = GetForegroundWindow();
  if (!foreground) return;
  HWND root = GetAncestor(foreground, GA_ROOTOWNER);
  if (!root) return;
  DWORD pid = 0;
  GetWindowThreadProcessId(root, &pid);
  if (!pid || pid == parentPid) return;
  if (lastForeground && lastForeground != root) ++switches;
  lastForeground = root;
}
// UTF-16 text as a JSON string value in UTF-8.
static std::string jsonText(const wchar_t *text, int length) {
  std::string utf8, out = "\"";
  if (length > 0) {
    int size = WideCharToMultiByte(CP_UTF8, 0, text, length, nullptr, 0, nullptr, nullptr);
    if (size > 0) { utf8.resize(size); WideCharToMultiByte(CP_UTF8, 0, text, length, utf8.data(), size, nullptr, nullptr); }
  }
  for (unsigned char c : utf8) {
    if (c == '"' || c == '\\') { out += '\\'; out += static_cast<char>(c); }
    else if (c < 0x20) { char escape[8]; snprintf(escape, sizeof escape, "\\u%04x", c); out += escape; }
    else out += static_cast<char>(c);
  }
  return out + "\"";
}
// The top-level foreground window: its handle (to find its capture), title and program name. Focus Guide's own windows are only flagged.
static std::string describeForeground(unsigned int request) {
  std::string reply = "{\"type\":\"window\",\"request\":" + std::to_string(request);
  HWND foreground = GetForegroundWindow();
  HWND root = foreground ? GetAncestor(foreground, GA_ROOT) : nullptr;
  DWORD pid = 0;
  if (root) GetWindowThreadProcessId(root, &pid);
  if (!root || !pid) return reply + ",\"found\":false}";
  if (pid == parentPid) return reply + ",\"found\":true,\"own\":true}";
  wchar_t title[257]{};
  int titleLength = GetWindowTextW(root, title, 257);
  wchar_t path[MAX_PATH]{}; DWORD pathLength = MAX_PATH;
  const wchar_t *name = L""; int nameLength = 0;
  if (HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid)) {
    if (QueryFullProcessImageNameW(process, 0, path, &pathLength)) {
      const wchar_t *slash = wcsrchr(path, L'\\');
      name = slash ? slash + 1 : path; nameLength = static_cast<int>(wcslen(name));
      if (nameLength > 4 && _wcsicmp(name + nameLength - 4, L".exe") == 0) nameLength -= 4;
      if (nameLength > 64) nameLength = 64;
    }
    CloseHandle(process);
  }
  return reply + ",\"found\":true,\"own\":false,\"hwnd\":\"" + std::to_string(reinterpret_cast<uintptr_t>(root))
    + "\",\"app\":" + jsonText(name, nameLength) + ",\"title\":" + jsonText(title, titleLength) + "}";
}
static bool monitor(bool enable) {
  const DWORD flags = enable ? RIDEV_INPUTSINK : RIDEV_REMOVE;
  RAWINPUTDEVICE devices[2] = {{1, 6, flags, enable ? window : nullptr},
                              {1, 2, flags, enable ? window : nullptr}};
  return RegisterRawInputDevices(devices, 2, sizeof(RAWINPUTDEVICE)) != FALSE;
}
static LRESULT CALLBACK procedure(HWND hwnd, UINT message, WPARAM wp, LPARAM lp) {
  if (message == WM_APP + 1) {
    auto command = reinterpret_cast<std::string*>(lp);
    std::istringstream input(*command); std::string action; input >> action; delete command;
    if (action == "start") {
      emitSample(); monitor(false); collecting = false;
      int next = 0; input >> next;
      if (next > 0 && monitor(true)) {
        epoch = next; started = boundary = GetTickCount64(); keys = clicks = scrolls = switches = 0; moved = false; lastForeground = nullptr;
        for (int i=0; i<256; ++i) down[i] = (GetAsyncKeyState(i) & 0x8000) != 0;
        collecting = true;
      }
      std::cout << "{\"type\":\"started\",\"epoch\":" << next << ",\"ok\":" << (collecting ? "true" : "false") << "}" << std::endl;
    } else if (action == "stop") {
      emitSample(); monitor(false); collecting = false; lastForeground = nullptr;
      std::cout << "{\"type\":\"stopped\",\"epoch\":" << epoch << "}" << std::endl;
    } else if (action == "hotkey") {
      unsigned int request=0, modifiers=0, key=0; input >> request >> modifiers >> key;
      bool ok = false;
      if (key == 0) { UnregisterHotKey(window, 1); hotModifiers = hotKey = 0; ok = true; }
      else if (modifiers <= 15 && modifiers > 0 && key <= 255) {
        if (modifiers == hotModifiers && key == hotKey) ok = true;
        else if (RegisterHotKey(window, 2, modifiers | MOD_NOREPEAT, key)) {
          UnregisterHotKey(window, 1); UnregisterHotKey(window, 2);
          ok = RegisterHotKey(window, 1, modifiers | MOD_NOREPEAT, key) != FALSE;
          if (ok) { hotModifiers=modifiers; hotKey=key; }
          else if (hotKey) RegisterHotKey(window, 1, hotModifiers | MOD_NOREPEAT, hotKey);
        }
      }
      std::cout << "{\"type\":\"hotkey\",\"request\":" << request << ",\"ok\":" << (ok ? "true" : "false") << "}" << std::endl;
    } else if (action == "window") {
      unsigned int request = 0; input >> request;
      std::cout << describeForeground(request) << std::endl;
    }
    return 0;
  }
  if (message == WM_INPUT && collecting) {
    UINT size = 0;
    if (GetRawInputData(reinterpret_cast<HRAWINPUT>(lp), RID_INPUT, nullptr, &size, sizeof(RAWINPUTHEADER)) == 0 && size <= 4096) {
      std::vector<BYTE> buffer(size);
      if (GetRawInputData(reinterpret_cast<HRAWINPUT>(lp), RID_INPUT, buffer.data(), &size, sizeof(RAWINPUTHEADER)) == size) {
        auto raw = reinterpret_cast<RAWINPUT*>(buffer.data());
        if (raw->header.dwType == RIM_TYPEKEYBOARD) {
          auto key = raw->data.keyboard.VKey;
          if (key < 256) { bool released = (raw->data.keyboard.Flags & RI_KEY_BREAK) != 0;
            if (!released && !down[key]) ++keys;
            down[key] = !released;
          }
        } else if (raw->header.dwType == RIM_TYPEMOUSE) {
          auto &mouse = raw->data.mouse;
          for (USHORT flag : {RI_MOUSE_LEFT_BUTTON_DOWN, RI_MOUSE_RIGHT_BUTTON_DOWN, RI_MOUSE_MIDDLE_BUTTON_DOWN, RI_MOUSE_BUTTON_4_DOWN, RI_MOUSE_BUTTON_5_DOWN}) if (mouse.usButtonFlags & flag) ++clicks;
          if (mouse.usButtonFlags & (RI_MOUSE_WHEEL | RI_MOUSE_HWHEEL)) ++scrolls;
          if (mouse.lLastX || mouse.lLastY) moved = true;
        }
      }
    }
    return DefWindowProc(hwnd, message, wp, lp);
  }
  if (message == WM_HOTKEY) { std::cout << "{\"type\":\"return\"}" << std::endl; return 0; }
  if (message == WM_TIMER) {
    if (WaitForSingleObject(parentProcess, 0) != WAIT_TIMEOUT) { DestroyWindow(hwnd); return 0; }
    sampleForeground(); emitSample(); std::cout << "{\"type\":\"heartbeat\"}" << std::endl; return 0;
  }
  if (message == WM_CLOSE) { monitor(false); DestroyWindow(hwnd); return 0; }
  if (message == WM_DESTROY) { PostQuitMessage(0); return 0; }
  return DefWindowProc(hwnd, message, wp, lp);
}
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  char *end = nullptr; auto pid = strtoul(argv[1], &end, 10);
  if (!pid || !end || *end) return 2;
  parentPid = pid;
  parentProcess = OpenProcess(SYNCHRONIZE, FALSE, pid); if (!parentProcess) return 3;
  WNDCLASSW cls{}; cls.lpfnWndProc = procedure; cls.hInstance=GetModuleHandle(nullptr); cls.lpszClassName=L"FocusGuideAggregateInput";
  if (!RegisterClassW(&cls)) return 4;
  window = CreateWindowW(cls.lpszClassName, L"", 0, 0, 0, 0, 0, HWND_MESSAGE, nullptr, cls.hInstance, nullptr);
  if (!window) return 5;
  SetTimer(window, 1, 1000, nullptr);
  std::thread([] { std::string line;
    while (std::getline(std::cin, line)) {
      if (line.size() > 128) break;
      auto command = new std::string(line);
      if (!PostMessage(window, WM_APP + 1, 0, reinterpret_cast<LPARAM>(command))) { delete command; break; }
    }
    PostMessage(window, WM_CLOSE, 0, 0);
  }).detach();
  std::cout << "{\"type\":\"ready\"}" << std::endl;
  MSG message; while (GetMessage(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessage(&message); }
  CloseHandle(parentProcess); return 0;
}
