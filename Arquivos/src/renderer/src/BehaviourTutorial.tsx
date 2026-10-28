import { useState, type ReactNode } from 'react';
import { Button, cn } from './ui';
import { Modal } from './components';

export type TutorialTarget = 'Settings' | 'Patterns' | 'Goals' | 'Calendar';
interface TutorialStep { title: string; body: ReactNode; target?: TutorialTarget; goLabel?: string }

const steps: TutorialStep[] = [
  { title: 'Aprenda com os seus próprios registros', body: <>
    <p>O Focus Guide pode mostrar padrões na forma como você foca. Ele usa apenas os seus próprios registros.</p>
    <p>Todos os dados ficam neste computador. O app não dá nota à sua atenção. Ele mostra o que você fez e o que você relatou.</p>
    <p>Este tutorial leva cerca de dois minutos. Você pode abri-lo de novo em Configurações ou em Padrões.</p></> },
  { title: 'Ative os totais de teclado e mouse', target: 'Settings', goLabel: 'Abrir Configurações', body: <>
    <p>Em Configurações, ative <strong>Coletar totais de teclado e mouse</strong>. Depois selecione <strong>Salvar preferências</strong>. Fica desativado até você fazer isso.</p>
    <p>A coleta só acontece enquanto uma sessão de foco está em andamento. Ela conta teclas pressionadas, cliques, rolagens, movimentos do mouse e trocas da janela em primeiro plano.</p>
    <p>O app nunca salva texto digitado, nomes de teclas, posições do mouse, títulos de janelas nem nomes de programas. Para remover os dados, use <strong>Excluir atividade coletada</strong> em Configurações.</p></> },
  { title: 'Responda aos check-ins de atenção', target: 'Settings', goLabel: 'Abrir Configurações', body: <>
    <p>Um check-in pergunta: &ldquo;Onde está a sua atenção agora?&rdquo; Selecione <strong>Na tarefa</strong>, <strong>Divagando</strong> ou <strong>Em outro lugar</strong>. Um clique basta.</p>
    <p>Os check-ins vêm desativados. Para ativá-los, use <strong>Check-ins de atenção</strong> em Configurações. Para desativá-los, desmarque a opção e salve.</p>
    <p>O primeiro check-in aparece após 8 a 20 minutos ativos. Os seguintes vêm com 15 a 35 minutos de intervalo. Se você não responder em 45 segundos, o app registra como perdido. Não há check-ins no modo Offline, durante uma pausa ou durante um intervalo.</p></> },
  { title: 'Marque quando você voltar', body: <>
    <p>Quando perceber que a sua mente divagou, pressione <strong>Ctrl+Alt+Space</strong>. Você também pode usar o pequeno botão de confirmação no timer flutuante.</p>
    <p>Isso salva um marcador <strong>Voltei</strong>. Os insights usam esses marcadores para ver por quanto tempo você foca antes de divagar. Você pode mudar o atalho em Configurações.</p></> },
  { title: 'Reflita depois de uma sessão', target: 'Calendar', goLabel: 'Abrir Calendário', body: <>
    <p>Depois de uma sessão, o check-in tem duas perguntas opcionais: <strong>O que mais atrapalhou?</strong> e <strong>Quão exigente foi?</strong></p>
    <p>Para remover uma resposta, selecione-a de novo ou selecione <strong>Limpar</strong>. Você pode mudar as respostas depois com <strong>Editar</strong> no Calendário.</p>
    <p>Para deixar uma sessão fora dos insights, selecione <strong>Excluir esta sessão dos insights</strong>.</p></> },
  { title: 'Leia a aba Insights', target: 'Patterns', goLabel: 'Abrir Padrões', body: <>
    <p>Em Padrões, abra a aba <strong>Insights</strong>. Os filtros de período, área e meta valem para ela.</p>
    <p>No topo, <strong>Os dados por trás destes insights</strong> mostra quantas sessões e avaliações a análise usa.</p>
    <p>Cada número precisa de um mínimo de dados. Por exemplo, <em>Quando você foca melhor</em> precisa de 10 sessões avaliadas. <em>O que costuma acompanhar um foco maior</em> precisa de 30 sessões avaliadas ao longo de 14 dias. Um número com poucos dados diz o que falta.</p></> },
  { title: 'Leia os números com cuidado', target: 'Patterns', goLabel: 'Abrir Padrões', body: <>
    <p>Os intervalos são de 90%. Um intervalo largo significa que o resultado é incerto. Um valor ausente é uma lacuna, não um zero.</p>
    <p>Suas avaliações e marcadores são o que você relatou. Um padrão é uma associação. Ele não mostra uma causa.</p>
    <p>Cada sugestão mostra os seus números. <strong>Experimentar na próxima semana</strong> a adiciona ao seu ajuste semanal, e você pode editá-la. Para ver como a aba fica com dados, selecione <strong>Explorar um exemplo</strong>. O exemplo usa sessões inventadas.</p></> },
  { title: 'Veja o comportamento de uma meta', target: 'Goals', goLabel: 'Abrir Metas', body: <>
    <p>Abra uma meta e selecione <strong>Comportamento</strong>. Ele mostra como você estuda essa meta: modos de atividade, horários do dia, etapas do roteiro, retornos, interrupções e avaliações.</p>
    <p>Escolha 7 dias, 30 dias, 90 dias ou todo o período. Uma cobertura de coleta baixa significa que as taxas de teclado e mouse descrevem apenas uma pequena parte do tempo.</p></> },
  { title: 'Opcional: compartilhe insights com um agente de IA', target: 'Settings', goLabel: 'Abrir Configurações', body: <>
    <p>Se você conectar um agente de IA, ele pode ler os mesmos insights com a ferramenta <code>get_focus_insights</code>. O acesso somente leitura basta.</p>
    <p>O acesso vem desativado. Quando está ativado, o que o agente lê vai para o provedor de IA dele. Mantenha o acesso desativado se quiser que os seus dados fiquem neste computador.</p></> }
];

/** Step-by-step guide to the behaviour features. Step position lives only in this component; nothing is saved. */
export default function BehaviourTutorial({ open, onClose, goTo }: { open: boolean; onClose: () => void; goTo: (target: TutorialTarget) => void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index], last = index === steps.length - 1;
  const close = () => { onClose(); };
  const finish = () => { setIndex(0); onClose(); };
  return <Modal open={open} title="Tutorial de comportamento" onClose={close}>
    <div className="tutorial" role="group" aria-label={`Passo ${index + 1} de ${steps.length}`}>
      <p className="tiny-label">PASSO {index + 1} DE {steps.length}</p>
      <h3 className="mt-1 text-title font-medium">{step.title}</h3>
      <div className="tutorial-body mt-2 space-y-2 text-ink">{step.body}</div>
      {step.target && <Button className="mt-3" size="sm" icon="arrow" onClick={() => { goTo(step.target!); onClose(); }}>{step.goLabel ?? 'Ir até lá'}</Button>}
      <div className="mt-4 flex justify-center gap-2" aria-hidden="true">{steps.map((s, i) => <span key={s.title} className={cn('h-2 w-2 rounded-pill', i === index ? 'bg-accent' : 'bg-line-strong')} />)}</div>
    </div>
    <div className="modal-actions">
      <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>Voltar</Button>
      {last ? <Button variant="primary" onClick={finish}>Concluir</Button> : <Button variant="primary" onClick={() => setIndex(index + 1)}>Avançar</Button>}
    </div>
  </Modal>;
}
