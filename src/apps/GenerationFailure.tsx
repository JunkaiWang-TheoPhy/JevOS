import { useEffect, useRef } from 'react';
import styles from './generation-feedback.module.css';

export default function GenerationFailure({ message, onClose, onEdit, onRetry }: {
  message: string; onClose(): void; onEdit(): void; onRetry(): void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLButtonElement>('.command-launch')?.focus();
    };
  }, []);
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className={styles.panel} role="alertdialog" aria-modal="true" aria-labelledby="generation-failure-title" aria-describedby="generation-failure-message" tabIndex={-1}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
          const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button') || []);
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (event.shiftKey && index <= 0) { event.preventDefault(); buttons.at(-1)?.focus(); }
          else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[0]?.focus(); }
        }
      }}>
      <h2 id="generation-failure-title">这个 App 还没生成成功</h2>
      <p id="generation-failure-message">{message}</p>
      <small>已有窗口和草稿仍然保留。</small>
      <div className={styles.actions}><button onClick={onClose}>回到桌面</button><button onClick={onEdit}>修改需求</button><button className={styles.retry} onClick={onRetry}>重试生成</button></div>
    </section>
  </div>;
}
