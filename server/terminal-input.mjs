// Director cues are simulation data, never executable shell arguments.
export function parseTerminalInput(value) {
  let command = '', quote = '', escaped = false;
  const directives = [];
  const code = classifyTerminalInput(value).kind === 'code';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (escaped) { command += char; escaped = false; continue; }
    if (char === '\\') { command += char; escaped = true; continue; }
    if (quote) { command += char; if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; command += char; continue; }
    if (char === '(' && (i === 0 || /\s/.test(value[i - 1]))) {
      let depth = 1, j = i + 1;
      for (; j < value.length && depth; j++) { if (value[j] === '(') depth++; if (value[j] === ')') depth--; }
      const cue = value.slice(i + 1, depth ? value.length : j - 1).trim();
      const attachedCall = code && /[\w]\s*$/.test(command);
      const director = (code ? /^(?:显示|隐藏|故意|退出模拟|恢复模拟|进入模拟|解释|输出|只回答|请|用|让|模拟)|^(?:exit|resume|show|hide|fail|deliberately|pretend|use|respond|output|make|be)\b/i : /^[\u3400-\u9fff]|^(?:exit|resume|show|hide|fail|deliberately|pretend|use|respond|output|make|be)\b/i).test(cue);
      if (!attachedCall && director) { directives.push(cue); i = j - 1; continue; }
    }
    command += char;
  }
  return { command: command.trim(), directives };
}
export function terminalPrompt(cwd) { return `root@universal-shell:${cwd}# `; }
export function initialTerminalState() {
  return { cwd: '/home/user', mode: 'shell', filesystem: {
    '/': { type: 'directory' }, '/home': { type: 'directory' }, '/home/user': { type: 'directory' },
    '/tmp': { type: 'directory' }, '/etc': { type: 'directory' }, '/usr': { type: 'directory' },
  }, env: { HOME: '/home/user', USER: 'root', PATH: '/usr/local/bin:/usr/bin:/bin' } };
}

export function classifyTerminalInput(value) {
  const text = value.trim();
  const fence = text.match(/^```\s*(python|py|java|cpp|c\+\+|cxx|bash|sh|shell)(?=\s|$)/i);
  const aliases = { py: 'python', 'c++': 'cpp', cxx: 'cpp', bash: 'shell', sh: 'shell' };
  if (fence) return { language: aliases[fence[1].toLowerCase()] || fence[1].toLowerCase(), kind: 'code' };
  const explicit = text.match(/^(python|py|java|cpp|c\+\+)\s*[:：]\s*/i);
  if (explicit) return { language: aliases[explicit[1].toLowerCase()] || explicit[1].toLowerCase(), kind: 'code' };
  if (/^(?:python(?:3)?|py|java|javac|g\+\+|clang\+\+)\s/i.test(text)) {
    const language = /^(?:java|javac)\b/.test(text) ? 'java' : /^(?:g\+\+|clang\+\+)/.test(text) ? 'cpp' : 'python';
    return { language, kind: 'command' };
  }
  if (/^(?:请|帮|用|写|解释|怎么|为什么|如何|你好|what\b|how\b|why\b|explain\b|write\b|please\b|help\b|hello\b|can you\b|tell me\b)/i.test(text)) {
    const language = /\b(?:python|py)\b|print\s*\(/i.test(text) ? 'python' : /\bjava\b|System\.out/i.test(text) ? 'java' : /c\+\+|\bcpp\b|std::/i.test(text) ? 'cpp' : 'natural';
    return { language, kind: 'request' };
  }
  if (/#include\s*[<"]|std::|\b(?:cout|cin)\s*<<|\bint\s+main\s*\(/.test(text)) return { language: 'cpp', kind: 'code' };
  if (/System\.out\.|(?:^|\n)\s*(?:import|package)\s+(?:java|javax|org|com)\.|\bpublic\s+(?:static\s+)?(?:class|void)|\bclass\s+\w+\s*\{/.test(text)) return { language: 'java', kind: 'code' };
  if (/(?:^|\n)\s*(?:def\s+\w+\s*\(|(?:from\s+\w+\s+)?import\s+\w+|print\s*\(|for\s+\w+\s+in\s+|\w+\s*=\s*[^=])/.test(text)) return { language: 'python', kind: 'code' };
  if (/^(?:ls|cd|pwd|mkdir|touch|cat|echo|rm|cp|mv|chmod|sudo|apt|npm|node|git|curl|wget|find|grep|head|tail|pip|dir|copy|del|cls|Get-\w+|Set-\w+)(?:\s|$)/i.test(text)) return { language: 'shell', kind: 'command' };
  if (/[\u3400-\u9fff]|^(?:what|how|why|explain|write|please|help|hello|hi|can you|tell me)\b/i.test(text)) {
    const language = /\b(?:python|py)\b/i.test(text) ? 'python' : /\bjava\b/i.test(text) ? 'java' : /c\+\+|\bcpp\b/i.test(text) ? 'cpp' : 'natural';
    return { language, kind: 'request' };
  }
  return { language: /^\S+(?:\s+[-/]\S+)*$/.test(text) ? 'shell' : 'natural', kind: /^\S+(?:\s+[-/]\S+)*$/.test(text) ? 'command' : 'request' };
}
