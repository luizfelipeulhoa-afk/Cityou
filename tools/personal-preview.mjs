import fs from 'node:fs'
import { chromium, python, browserOptions } from './runtime.mjs'
const browser=await chromium.launch({...browserOptions})
try {
 const page=await browser.newPage({viewport:{width:1440,height:1050}})
 const errors=[],failures=[],requests=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url()})});page.on('request',r=>requests.push(r.url()))
 await page.goto('http://127.0.0.1:8766/',{waitUntil:'networkidle'})
 await page.getByText('O que vamos tirar da sua cabeça?',{exact:true}).waitFor()
 await page.waitForFunction(()=>!document.querySelector('.loading-state'))
 fs.mkdirSync('.verification',{recursive:true})
 await page.screenshot({path:'.verification/personal-desktop.png',fullPage:true})
 const snapshot={title:await page.title(),errors,failures,initialCityBundle:requests.some(u=>/assets\/city-/.test(u)),tabs:await page.locator('.personal-nav-item').count()}
 await page.getByRole('link',{name:'Hábitos',exact:true}).click();await page.screenshot({path:'.verification/personal-habits.png',fullPage:true})
 await page.getByRole('button',{name:'Novo hábito',exact:true}).click();await page.getByRole('button',{name:'Agora não',exact:true}).click()
 await page.getByRole('link',{name:'Finanças',exact:true}).click();await page.screenshot({path:'.verification/personal-finance.png',fullPage:true})
 await page.getByRole('link',{name:'Seu dia',exact:true}).click()
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);await page.screenshot({path:'.verification/personal-mobile.png',fullPage:true})
 snapshot.mobile={width:390,scroll:await page.evaluate(()=>document.documentElement.scrollWidth)}
 console.log(JSON.stringify(snapshot,null,2));if(errors.length||snapshot.initialCityBundle||failures.length)process.exitCode=1
}finally{await browser.close()}
