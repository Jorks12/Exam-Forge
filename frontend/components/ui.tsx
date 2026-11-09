'use client';

import { useEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, Check, LoaderCircle } from 'lucide-react';

export function Heading({ kicker, title, description, action }: {
  kicker: string; title: string; description: string; action?: ReactNode;
}) {
  return <header className="page-heading"><div><p className="eyebrow">{kicker}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  return <div className={'notice ' + tone} role={tone === 'error' ? 'alert' : 'status'}>
    {tone === 'error' ? <AlertCircle size={18} /> : tone === 'success' ? <Check size={18} /> : <BookOpen size={18} />}
    <div>{children}</div></div>;
}
export function Loading() {
  return <div className="loading panel" role="status"><LoaderCircle className="spin" size={20} /> Зареждане…
    <span className="loading-track" aria-hidden="true" /></div>;
}
export function Failed({ error, retry }: { error: string; retry?: () => void }) {
  return <Notice>{error} {retry && <button type="button" className="text-button" onClick={retry}>Опитайте отново</button>}</Notice>;
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="empty panel"><span className="empty-icon"><BookOpen size={24} /></span>
    <h2>{title}</h2><p>{children}</p>{action}</section>;
}

export function Confirm({ title, description, action, pending, onCancel, onConfirm, destructive = false }: {
  title: string; description: string; action: string; pending: boolean; onCancel: () => void; onConfirm: () => void;
  destructive?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} className="confirm panel" aria-labelledby="confirm-title" aria-describedby="confirm-description"
    onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }}>
    <h2 id="confirm-title">{title}</h2><p id="confirm-description">{description}</p>
    <div className="actions">
      <button className="button" type="button" onClick={onCancel} disabled={pending} autoFocus>Отказ</button>
      <button className={'button ' + (destructive ? 'danger' : 'primary')} type="button" onClick={onConfirm} disabled={pending}>
        {pending ? 'Изпълнение…' : action}
      </button>
    </div>
  </dialog>;
}

export function Pagination({ page, total, limit, change }: { page: number; total: number; limit: number; change: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1 && page === 1) return null;
  return <nav className="pagination" aria-label="Страници">
    <button className="button" type="button" onClick={() => change(page - 1)} disabled={page <= 1}><ArrowLeft size={15} /> Назад</button>
    <span>Страница {page} от {pages}</span>
    <button className="button" type="button" onClick={() => change(page + 1)} disabled={page >= pages}>Напред <ArrowRight size={15} /></button>
  </nav>;
}

export function formValues(event: FormEvent<HTMLFormElement>, invalid: (message: string) => void) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) {
    const field = form.querySelector<HTMLElement>('input:invalid, select:invalid, textarea:invalid');
    field?.focus();
    invalid('Проверете задължителните полета и допустимите стойности.');
    return null;
  }
  return new FormData(form);
}

export function value(data: FormData, key: string) {
  return String(data.get(key) ?? '').trim();
}
