/** Exact open commands reuse the installed presentation; creation requests keep their normal route. */
export function preparedAppForCommand(text: string): 'generated:demo-presentation' | null {
  return /^(?:打开|开启|启动|open)\s*(?:ppt|power\s*point|演示文稿|路演文档|幻灯片)\s*[。！!.]?$/iu.test(text.trim())
    ? 'generated:demo-presentation' : null;
}
