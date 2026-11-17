import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.SSO_PREVIEW_PORT||4173);
const server=createServer(async(req,res)=>{
  try{
    const requestURL=new URL(req.url,'http://localhost'), pathname=requestURL.pathname;
    const scheme=['light','dark'].includes(requestURL.searchParams.get('scheme'))?requestURL.searchParams.get('scheme'):null;
    if(pathname==='/' ){res.writeHead(302,{Location:'/options.html'});res.end();return;}
    if(pathname==='/console-preview.html'){res.setHeader('Content-Type','text/html');res.end(await readFile(`${root}scripts/console-preview.html`,'utf8'));return;}
    if(['/popup.html','/options.html'].includes(pathname)){
      let page=await readFile(`${root}src/ui${pathname}`,'utf8');
      if(scheme)page=page.replace('href="styles.css"',`href="styles.css?scheme=${scheme}"`);
      res.setHeader('Content-Type','text/html');res.end(page.replace('<script type="module"','<script src="/demo.js"></script><script type="module"'));return;
    }
    if(['/styles.css','/popup.css'].includes(pathname)){
      let css=await readFile(`${root}src/ui${pathname}`,'utf8');
      // Preview-only media forcing exercises both palettes without changing OS
      // settings or adding test controls to the installed extension.
      if(pathname==='/styles.css'&&scheme)css=css.replace('color-scheme: light dark;',`color-scheme: ${scheme};`).replace('@media(prefers-color-scheme:dark)',scheme==='dark'?'@media all':'@media not all');
      res.setHeader('Content-Type','text/css');res.end(css);return;
    }
    if(/^\/icons\/(16|32|48|128)\.png$/.test(pathname)){res.setHeader('Content-Type','image/png');res.end(await readFile(`${root}src${pathname}`));return;}
    const sources={'/demo.js':'scripts/demo.js','/popup.js':'src/ui/popup.js','/options.js':'src/ui/options.js','/console-preview.js':'scripts/console-preview.js'};
    if(sources[pathname]){const output=await build({entryPoints:[`${root}${sources[pathname]}`],bundle:true,format:'iife',write:false,target:'chrome114'});res.setHeader('Content-Type','text/javascript');res.end(output.outputFiles[0].text);return;}
    res.writeHead(404);res.end('Not found');
  }catch(error){res.writeHead(500);res.end(error.message);}
});
server.listen(port,'127.0.0.1',()=>console.log(`UI preview: http://127.0.0.1:${port}/options.html\nPopup: http://127.0.0.1:${port}/popup.html`));
