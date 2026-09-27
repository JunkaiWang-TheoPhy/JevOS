import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const work=process.env.JEVOS_PPT_BUILD_DIR;
if(!work || !path.isAbsolute(work))throw new Error('Set JEVOS_PPT_BUILD_DIR to a new absolute build directory');
await fs.mkdir(work+'/private',{recursive:true});await fs.mkdir(work+'/output',{recursive:true});await fs.copyFile(root+'/drafts/demo/presentation/cover.png',work+'/private/cover.png');
const skill=process.env.PRESENTATIONS_SKILL_DIR;
if(!skill || !path.isAbsolute(skill))throw new Error('Set PRESENTATIONS_SKILL_DIR');
const {importRuntimeModule}=await import(pathToFileURL(skill+'/container_tools/runtime_helpers.mjs'));
const {Presentation,PresentationFile}=await importRuntimeModule('@oai/artifact-tool');
const {finalizePresentation,resolvePresentationFont}=await import(pathToFileURL(skill+'/container_tools/artifact_tool_utils.mjs'));
const deck=JSON.parse(await fs.readFile(root+'/drafts/demo/presentation/deck.json','utf8'));
const font=resolvePresentationFont({fontFamily:'PingFang SC'});
const ppt=Presentation.create({slideSize:{width:1280,height:720}});
const slides=[];
function text(slide,body,x,y,w,h,size=34,color='#282433',bold=false){const s=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});s.text=body;s.text.style={typeface:font,fontSize:size,bold,color,autoFit:'none'};return s;}
for(const [i,d] of deck.entries()){
 const s=ppt.slides.add();slides.push(s);s.background.fill=i===5?'#EDE7FF':'#FCFAF5';
 if(i===0){try{const image=await fs.readFile(work+'/private/cover.png');s.images.add({blob:new Uint8Array(image),contentType:'image/png',alt:'清晨工作台插画',fit:'cover',position:{left:0,top:0,width:1280,height:720}});}catch{/* The plain cover remains readable if the optional illustration is absent. */}}
 text(s,d.time,64,38,1152,40,22,'#796889');
 text(s,d.title,64,i===0?156:115,1152,i===0?124:85,i===0?90:53,'#292337',true);
 text(s,d.subtitle,64,i===0?295:205,1152,60,32,'#655B75');
 const top=i===0?448:313;
 for(const [j,line] of d.body.entries())text(s,line,64,top+j*62,1152,54,i===5&&j>1?25:34,j===0?'#5E469A':'#34303C',j===0);
 if(d.prompt)text(s,'“'+d.prompt+'”',64,608,1152,64,26,'#72598E');
 text(s,String(i+1).padStart(2,'0')+' / 06',1118,681,98,25,16,'#8A7E94');
 s.speakerNotes.textFrame.setText(d.notes+'\n来源：用户本会话确认的三分钟流程；本项目docs/demo/three-minute.zh.md。封面为AI插画，不作为真实产品截图。');
}
const candidate=work+'/private/candidate.pptx';await(await PresentationFile.exportPptx(ppt)).save(candidate);
for(const [i,s] of slides.entries()){const png=await ppt.export({slide:s,format:'png',scale:1});await fs.writeFile(`${work}/private/slide-${i+1}.png`,new Uint8Array(await png.arrayBuffer()));}
const result=await finalizePresentation({workspaceDir:work,candidatePath:candidate,finalPath:work+'/output/JevOS-roadshow.pptx',explicitTotalSlideCount:6,pythonExecutable:process.env.RUNTIME_PYTHON,integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:work+'/private/validation.json'});
console.log(JSON.stringify({finalPath:result.finalPath||work+'/output/JevOS-roadshow.pptx'}));
