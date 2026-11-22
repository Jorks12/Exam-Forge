import fs from 'node:fs/promises';
import {constants} from 'node:fs';
fs.link=async (a,b)=>fs.copyFile(a,b,constants.COPYFILE_EXCL);
import {pathToFileURL} from 'node:url';
const runtime='C:/Users/Zenbook/.cache/codex-runtimes/codex-primary-runtime/dependencies';
process.env.RUNTIME_NODE_MODULES=runtime+'/node/node_modules';
const skill='C:/Users/Zenbook/.codex/plugins/cache/openai-primary-runtime/presentations/26.1117.11355/skills/presentations';
const {finalizePresentation}=await import(pathToFileURL(skill+'/container_tools/artifact_tool_utils.mjs'));
const work='C:/Users/Zenbook/AppData/Local/Temp/examforge-presentation-final';
console.log(await finalizePresentation({workspaceDir:work,candidatePath:work+'/portable.pptx',finalPath:work+'/output/ExamForge_Presentation_BG.pptx',pythonExecutable:runtime+'/python/python.exe',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],fontPolicy:{basis:'design',families:['Segoe UI','Arial']},requiredNativeChartOwnerSlides:[8,9],materializeLiteralChartWorkbooks:false,verifyArtifactToolImport:true,receiptPath:work+'/validation.json'}));
await fs.copyFile(work+'/output/ExamForge_Presentation_BG.pptx',process.cwd()+'/presentation-output/ExamForge_Presentation_BG.pptx');



