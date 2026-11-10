#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <dispatch/dispatch.h>
#include <cerrno>
#include <csignal>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <unistd.h>

// The macOS counterpart of activity-helper.cpp: the same commands on stdin and the same JSON lines on stdout,
// so that src/main/behaviour.ts reads both helpers with one parser.
// No raw input leaves this process. Modifier state is transient and used only to count a modifier press once.
// The front window's title and program name leave only in reply to a "window" command (TypeSafe window check).
// The return shortcut is not here: on macOS the main process registers it (Electron globalShortcut).
// Input counts need the Input Monitoring permission. Window titles need the Screen Recording permission.
static pid_t parentPid;
static CFMachPortRef tap = nullptr;
static CFRunLoopSourceRef tapSource = nullptr;
static uint32_t lastForeground = 0;
static unsigned long long switches = 0;
static bool collecting = false, moved = false;
static int epoch = 0;
static unsigned long long started = 0, boundary = 0, keys = 0, clicks = 0, scrolls = 0;
static CGEventFlags heldModifiers = 0;
static const CGEventFlags modifierMask = kCGEventFlagMaskShift | kCGEventFlagMaskControl | kCGEventFlagMaskAlternate | kCGEventFlagMaskCommand | kCGEventFlagMaskAlphaShift;

// Monotonic milliseconds. The clock does not advance while the computer sleeps.
static unsigned long long tickMs() { return clock_gettime_nsec_np(CLOCK_UPTIME_RAW) / 1000000ull; }
static void emitSample() {
  if (!collecting) return;
  auto now = tickMs(), duration = now - boundary;
  if (duration) std::cout << "{\"type\":\"sample\",\"epoch\":" << epoch << ",\"endMs\":" << now - started
    << ",\"durationMs\":" << duration << ",\"keys\":" << keys << ",\"clicks\":" << clicks
    << ",\"scrolls\":" << scrolls << ",\"movementMs\":" << (moved ? duration : 0) << ",\"switches\":" << switches << "}" << std::endl;
  boundary = now; keys = clicks = scrolls = switches = 0; moved = false;
}
static long long numberValue(CFDictionaryRef info, CFStringRef key) {
  auto value = static_cast<CFNumberRef>(CFDictionaryGetValue(info, key));
  long long out = 0;
  if (value && CFGetTypeID(value) == CFNumberGetTypeID()) CFNumberGetValue(value, kCFNumberLongLongType, &out);
  return out;
}
// The first characters of a text as UTF-8. The limit counts UTF-16 units, as the Windows helper does, and never splits a character.
static std::string textValue(CFDictionaryRef info, CFStringRef key, CFIndex limit) {
  auto value = static_cast<CFStringRef>(CFDictionaryGetValue(info, key));
  if (!value || CFGetTypeID(value) != CFStringGetTypeID()) return "";
  CFIndex length = CFStringGetLength(value);
  if (length > limit) {
    length = limit;
    CFRange last = CFStringGetRangeOfComposedCharactersAtIndex(value, length - 1);
    if (last.location + last.length > length) length = last.location;
  }
  CFIndex size = 0;
  CFStringGetBytes(value, CFRangeMake(0, length), kCFStringEncodingUTF8, '?', false, nullptr, 0, &size);
  std::string out(static_cast<size_t>(size), '\0');
  if (size > 0) CFStringGetBytes(value, CFRangeMake(0, length), kCFStringEncodingUTF8, '?', false, reinterpret_cast<UInt8*>(&out[0]), size, &size);
  return out;
}
// UTF-8 text as a JSON string value.
static std::string jsonText(const std::string &utf8) {
  std::string out = "\"";
  for (unsigned char c : utf8) {
    if (c == '"' || c == '\\') { out += '\\'; out += static_cast<char>(c); }
    else if (c < 0x20) { char escape[8]; snprintf(escape, sizeof escape, "\\u%04x", c); out += escape; }
    else out += static_cast<char>(c);
  }
  return out + "\"";
}
struct Front { bool found = false; pid_t pid = 0; uint32_t id = 0; std::string app, title; };
// The front normal window. The system lists windows from front to back; layer 0 leaves out the menu bar, the Dock and floating panels.
static Front frontWindow(bool withText) {
  Front front;
  CFArrayRef list = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
  if (!list) return front;
  for (CFIndex index = 0, count = CFArrayGetCount(list); index < count; ++index) {
    auto info = static_cast<CFDictionaryRef>(CFArrayGetValueAtIndex(list, index));
    if (!info || numberValue(info, kCGWindowLayer) != 0) continue;
    auto alpha = static_cast<CFNumberRef>(CFDictionaryGetValue(info, kCGWindowAlpha));
    double visible = 1;
    if (alpha && CFGetTypeID(alpha) == CFNumberGetTypeID()) CFNumberGetValue(alpha, kCFNumberDoubleType, &visible);
    if (visible <= 0) continue;
    front.found = true;
    front.pid = static_cast<pid_t>(numberValue(info, kCGWindowOwnerPID));
    front.id = static_cast<uint32_t>(numberValue(info, kCGWindowNumber));
    if (withText) { front.app = textValue(info, kCGWindowOwnerName, 64); front.title = textValue(info, kCGWindowName, 256); }
    break;
  }
  CFRelease(list);
  return front;
}
static void sampleForeground() {
  if (!collecting) return;
  Front front = frontWindow(false);
  if (!front.found || !front.pid || !front.id || front.pid == parentPid) return;
  if (lastForeground && lastForeground != front.id) ++switches;
  lastForeground = front.id;
}
// The front window: its window number (to find its capture), title and program name. Focus Guide's own windows are only flagged.
// The reply keeps the key "hwnd" of the Windows helper; here it holds the CGWindowID that Electron uses in its capture ids.
static std::string describeForeground(unsigned int request) {
  std::string reply = "{\"type\":\"window\",\"request\":" + std::to_string(request);
  Front front = frontWindow(true);
  if (!front.found || !front.pid) return reply + ",\"found\":false}";
  if (front.pid == parentPid) return reply + ",\"found\":true,\"own\":true}";
  return reply + ",\"found\":true,\"own\":false,\"hwnd\":\"" + std::to_string(front.id)
    + "\",\"app\":" + jsonText(front.app) + ",\"title\":" + jsonText(front.title) + "}";
}
static CGEventRef onEvent(CGEventTapProxy, CGEventType type, CGEventRef event, void *) {
  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) { if (tap && collecting) CGEventTapEnable(tap, true); return event; }
  if (!collecting) return event;
  switch (type) {
    case kCGEventKeyDown: if (!CGEventGetIntegerValueField(event, kCGKeyboardEventAutorepeat)) ++keys; break;
    case kCGEventFlagsChanged: {
      CGEventFlags flags = CGEventGetFlags(event) & modifierMask;
      if (flags & ~heldModifiers) ++keys;
      heldModifiers = flags;
      break;
    }
    case kCGEventLeftMouseDown: case kCGEventRightMouseDown: case kCGEventOtherMouseDown: ++clicks; break;
    // The system sends momentum events after the fingers leave a trackpad. They are not input.
    case kCGEventScrollWheel: if (!CGEventGetIntegerValueField(event, kCGScrollWheelEventMomentumPhase)) ++scrolls; break;
    case kCGEventMouseMoved: case kCGEventLeftMouseDragged: case kCGEventRightMouseDragged: case kCGEventOtherMouseDragged: moved = true; break;
    default: break;
  }
  return event;
}
static bool monitor(bool enable) {
  if (!enable) {
    if (tap) {
      CGEventTapEnable(tap, false);
      if (tapSource) { CFRunLoopRemoveSource(CFRunLoopGetMain(), tapSource, kCFRunLoopCommonModes); CFRelease(tapSource); tapSource = nullptr; }
      CFMachPortInvalidate(tap); CFRelease(tap); tap = nullptr;
    }
    return true;
  }
  if (tap) return true;
  // Without the Input Monitoring permission the system asks the user once. Collection starts at a later request.
  if (!CGPreflightListenEventAccess() && !CGRequestListenEventAccess()) return false;
  const CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventFlagsChanged)
    | CGEventMaskBit(kCGEventLeftMouseDown) | CGEventMaskBit(kCGEventRightMouseDown) | CGEventMaskBit(kCGEventOtherMouseDown)
    | CGEventMaskBit(kCGEventScrollWheel) | CGEventMaskBit(kCGEventMouseMoved)
    | CGEventMaskBit(kCGEventLeftMouseDragged) | CGEventMaskBit(kCGEventRightMouseDragged) | CGEventMaskBit(kCGEventOtherMouseDragged);
  tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionListenOnly, mask, onEvent, nullptr);
  if (!tap) return false;
  tapSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
  if (!tapSource) { CFMachPortInvalidate(tap); CFRelease(tap); tap = nullptr; return false; }
  CFRunLoopAddSource(CFRunLoopGetMain(), tapSource, kCFRunLoopCommonModes);
  CGEventTapEnable(tap, true);
  return true;
}
static void quit(void *) { CFRunLoopStop(CFRunLoopGetMain()); }
// One command line from stdin, on the main thread.
static void onCommand(void *context) {
  auto command = static_cast<std::string*>(context);
  std::istringstream input(*command); std::string action; input >> action; delete command;
  if (action == "start") {
    emitSample(); monitor(false); collecting = false;
    int next = 0; input >> next;
    if (next > 0 && monitor(true)) {
      epoch = next; started = boundary = tickMs(); keys = clicks = scrolls = switches = 0; moved = false; lastForeground = 0;
      heldModifiers = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState) & modifierMask;
      collecting = true;
    }
    std::cout << "{\"type\":\"started\",\"epoch\":" << next << ",\"ok\":" << (collecting ? "true" : "false") << "}" << std::endl;
  } else if (action == "stop") {
    emitSample(); monitor(false); collecting = false; lastForeground = 0;
    std::cout << "{\"type\":\"stopped\",\"epoch\":" << epoch << "}" << std::endl;
  } else if (action == "hotkey") {
    // Only the removal of a shortcut succeeds: this helper registers none.
    unsigned int request = 0, modifiers = 0, key = 0; input >> request >> modifiers >> key;
    std::cout << "{\"type\":\"hotkey\",\"request\":" << request << ",\"ok\":" << (key == 0 ? "true" : "false") << "}" << std::endl;
  } else if (action == "window") {
    unsigned int request = 0; input >> request;
    std::cout << describeForeground(request) << std::endl;
  }
}
static void onTick(CFRunLoopTimerRef, void *) {
  if (kill(parentPid, 0) != 0 && errno == ESRCH) { quit(nullptr); return; }
  sampleForeground(); emitSample(); std::cout << "{\"type\":\"heartbeat\"}" << std::endl;
}
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  char *end = nullptr; auto pid = strtoul(argv[1], &end, 10);
  if (!pid || !end || *end) return 2;
  parentPid = static_cast<pid_t>(pid);
  if (kill(parentPid, 0) != 0 && errno == ESRCH) return 3;
  // Close with the parent, also between two timer ticks.
  dispatch_source_t parent = dispatch_source_create(DISPATCH_SOURCE_TYPE_PROC, static_cast<uintptr_t>(parentPid), DISPATCH_PROC_EXIT, dispatch_get_main_queue());
  if (parent) { dispatch_source_set_event_handler_f(parent, quit); dispatch_resume(parent); }
  CFRunLoopTimerRef timer = CFRunLoopTimerCreate(kCFAllocatorDefault, CFAbsoluteTimeGetCurrent() + 1, 1, 0, 0, onTick, nullptr);
  if (!timer) return 4;
  CFRunLoopAddTimer(CFRunLoopGetMain(), timer, kCFRunLoopCommonModes);
  std::thread([] { std::string line;
    while (std::getline(std::cin, line)) {
      if (line.size() > 128) break;
      dispatch_async_f(dispatch_get_main_queue(), new std::string(line), onCommand);
    }
    dispatch_async_f(dispatch_get_main_queue(), nullptr, quit);
  }).detach();
  std::cout << "{\"type\":\"ready\"}" << std::endl;
  CFRunLoopRun();
  monitor(false);
  return 0;
}
