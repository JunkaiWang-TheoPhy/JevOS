import { createContext, useContext } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { defineCatalog } from '@json-render/core';
import { defineRegistry, schema } from '@json-render/react';
import { z } from 'zod';
import type { Workspace } from './workspace';

export const WorkspaceContext = createContext<{ state: Workspace; setState: Dispatch<SetStateAction<Workspace>> } | null>(null);
function useWorkspace() { const ctx = useContext(WorkspaceContext); if (!ctx) throw new Error('Workspace provider missing'); return ctx; }
const empty = { props: z.object({}), slots: [], description: '工作区组件' };
export const catalog = defineCatalog(schema, { components: {
  Frame: { ...empty, slots: ['default'] }, Message: empty, Notes: empty, Contact: empty, Calendar: empty, Tasks: empty,
}, actions: {} });
function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) { return <section className={`card ${className}`}><h2>{title}</h2>{children}</section>; }
function Message() { return <Card title="一起看看 JevOS 的下一步" className="message"><div className="sender"><span className="avatar">A</span><div><strong>Alice</strong><small>alice@example.com</small></div><span className="timestamp">今天 10:24</span></div><p>我们已经有了第一个工作区原型。我想一起核对几个问题，再决定下一步。</p><p>用户从阅读切换到会议或异步评审时，笔记和日历草稿应该一直留在原处。自动建议也不能打断正在输入的内容。</p><blockquote>如果明天下午方便，我们约个时间讨论；也可以先改成异步评审。</blockquote><div className="message-footer">交互评审</div></Card>; }
function Notes() { const {state,setState} = useWorkspace(); return <Card title="随手笔记" className="notes"><label htmlFor="workspace-note">你的记录会保存在这台设备</label><textarea id="workspace-note" placeholder="先记下来，切换任务也不会丢失…" value={state.note} maxLength={10000} onChange={e => setState(s=>({...s,note:e.target.value}))}/><small>提交后保存在 SQLite；本机保留离线草稿缓存。请勿填写敏感信息。</small></Card>; }
function Contact() { const {state} = useWorkspace(); if(state.mode !== 'meeting') return null; return <Card title="参与人"><div className="sender"><span className="avatar">A</span><div><strong>Alice</strong><small>alice@example.com</small></div></div><p className="muted">来自当前消息。</p></Card>; }
function Calendar() { const {state,setState} = useWorkspace(); if(state.mode !== 'meeting') return null; const patch = (key: keyof Workspace['meeting'],value:string)=>setState(s=>({...s,meeting:{...s.meeting,[key]:value}})); return <Card title="会议草稿" className="calendar"><p className="participant">参与人 <strong>Alice</strong> · alice@example.com</p><label htmlFor="meeting-title">主题</label><input id="meeting-title" value={state.meeting.title} maxLength={200} onChange={e=>patch('title',e.target.value)}/><div className="form-row"><div><label htmlFor="meeting-date">日期</label><input id="meeting-date" type="date" value={state.meeting.date} onChange={e=>patch('date',e.target.value)}/></div><div><label htmlFor="meeting-time">时间</label><input id="meeting-time" type="time" value={state.meeting.time} onChange={e=>patch('time',e.target.value)}/></div></div><p className="save-status">有效草稿会自动提交 · 同步结果见上方 · 不会创建会议或发送邀请</p></Card>; }
function Tasks() { const {state,setState} = useWorkspace(); if(state.mode !== 'review') return null; return <Card title="异步评审清单" className="tasks"><p className="muted">评审建议</p>{state.tasks.map((task,index)=><label key={task} className="task"><input type="checkbox" onChange={()=>setState(s=>({...s,tasks:s.tasks.filter((_,i)=>i!==index)}))}/><span>{task}</span></label>)}{!state.tasks.length && <p>这一轮的评审事项已经完成。</p>}<small>勾选后移除事项并提交；离线修改保留在本机。</small></Card>; }
export const { registry } = defineRegistry(catalog,{components:{Frame:({children})=><div className="workspace-grid">{children}</div>,Message,Notes,Contact,Calendar,Tasks}});
export const workspaceSpec = {root:'frame',elements:{frame:{type:'Frame',props:{},children:['message','notes','calendar','tasks']},message:{type:'Message',props:{},children:[]},notes:{type:'Notes',props:{},children:[]},contact:{type:'Contact',props:{},children:[]},calendar:{type:'Calendar',props:{},children:[]},tasks:{type:'Tasks',props:{},children:[]}}};
