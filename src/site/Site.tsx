import { useEffect, useState } from 'react';
import App from '../App';
import { usePwa } from '../pwa';
import { desktopDownload } from '../site-mode.ts';
import banner from '../../assets/jevos-desktop.png';
import './site.css';

export default function Site() {
  usePwa();
  const [desktop, setDesktop] = useState(location.hash === '#/desktop');
  useEffect(() => { const update = () => setDesktop(location.hash === '#/desktop'); addEventListener('hashchange', update); return () => removeEventListener('hashchange', update); }, []);
  if (desktop) return <><App /><div className="site-demo-bar"><a href="#/">← JevOS 首页</a><span>浏览器体验</span><a href={desktopDownload}>下载 macOS 版 ↗</a></div></>;
  return <div className="jevos-site">
    <nav className="site-nav"><a className="site-wordmark" href="#/"><img src={`${import.meta.env.BASE_URL}brand/mark.svg`} alt="" />JevOS</a><div><a href="https://github.com/JunkaiWang-TheoPhy/JevOS">GitHub ↗</a><a href={desktopDownload}>下载应用</a></div></nav>
    <main className="site-hero"><section><p className="site-eyebrow">YOUR TASK. YOUR DESKTOP.</p><h1>一句话，<br />桌面跟着你走。</h1><p className="site-description">阅读、笔记、音乐与工具随任务组合。Jev 判断下一步，语言模型把想法变成可运行的微应用。</p><div className="site-buttons"><a className="site-primary" href={desktopDownload}>下载 macOS 版 <span>↗</span></a><a className="site-secondary" href="#/desktop">在浏览器体验 <span>→</span></a></div><p className="site-system">Apple Silicon · macOS 13+</p></section><figure className="site-art"><img src={banner} alt="JevOS 的工具窗口围绕任务组合" /><figcaption><span>✦ 思路留在这里</span><span>工具随你变化</span></figcaption></figure></main>
    <section className="site-flow"><div><span>01</span><h2>说出想做的事</h2><p>从一个念头开始，让工具围绕任务出现。</p></div><div><span>02</span><h2>让窗口接上工作</h2><p>移动、组合与切换，笔记和应用状态持续保存。</p></div><div><span>03</span><h2>把想法做成应用</h2><p>生成自己的工具，打开即用，保存后继续。</p></div></section>
    <footer className="site-footer"><span>JevOS · 从判断，到行动。</span><div><a href="mailto:WangTheoPhys@outlook.com">联系作者</a><a href="https://Junkaiwang-theophy.github.io">个人网站 ↗</a></div></footer>
  </div>;
}
