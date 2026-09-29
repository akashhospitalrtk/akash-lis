import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { indiaCatalogue } from '../dist/src/data/indiaCatalogue.js';
import { profileSchema } from '../dist/src/schemas/profileSchemas.js';

const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
function record(profile,id=randomUUID()) {
  return {id,code:profile.code,name:profile.name,department:profile.department,specimen_type:profile.specimenType,description:profile.description,instructions:profile.instructions,active:true,
    parameters:profile.parameters.map(p=>({id:randomUUID(),code:p.code,name:p.name,result_kind:p.resultKind,unit:p.unit,method:p.method,reference_ranges:p.referenceRanges,reference_note:p.referenceNote,description:p.description,select_options:p.selectOptions,common_values:p.commonValues,calculation_formula:p.calculationFormula,sort_order:p.sortOrder,active:true}))};
}
const catalogue=indiaCatalogue.map(p=>record(p));
let submitted;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(15000);
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',dialog=>dialog.accept());
// All API requests are intercepted: no real patient reads or production writes.
await page.route('**/api/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  let data=[];
  if(pathname.endsWith('/config')) data={hospital:{name:'Synthetic catalogue UI check'}};
  else if(pathname.endsWith('/setup/status')) data={initialized:true};
  else if(pathname.endsWith('/auth/me')) data={user:{id:randomUUID(),fullName:'Synthetic operator',role:'ADMIN'}};
  else if(pathname.endsWith('/descriptions')) data={profiles:{},parameters:{}};
  else if(pathname.includes('/catalogue/profiles/') && route.request().method()==='PUT') {
    submitted=profileSchema.parse(route.request().postDataJSON());
    const id=pathname.split('/').at(-1),index=catalogue.findIndex(p=>p.id===id);
    data=record(submitted,id);catalogue[index]=data;
  } else if(pathname.endsWith('/profiles')) data=catalogue;
  else if(pathname.includes('/clinical/')) data={items:[],hasMore:false};
  await route.fulfill({json:{success:true,data}});
});
try {
  await page.addInitScript(()=>localStorage.setItem('lis_token','synthetic-ui-token'));
  await page.goto('http://localhost:8081/tests');
  await page.getByRole('heading',{name:'Investigation catalogue',exact:true}).waitFor();
  await page.getByText(`${catalogue.length} active`,{exact:true}).waitFor();
  assert.equal(await page.locator('.catalogue-item').count(),6);
  for(const code of ['UR_ACR','TSH','CULT_URINE','BIOPSY_SMALL','BCRABL_QUANT']) {
    await page.getByLabel('Search investigations',{exact:true}).fill(code);
    const item=page.locator('.catalogue-item').filter({hasText:code}).first();
    await item.click();
    assert.equal(await page.getByLabel('Test code *',{exact:true}).inputValue(),code);
    assert.ok(await page.locator('.parameter-summary').count()>0);
  }
  await page.getByLabel('Search investigations',{exact:true}).fill('Fasting plasma glucose');
  await page.locator('.catalogue-item').click();
  await page.locator('.parameter-summary').first().click();
  assert.equal(await page.getByLabel('Unit',{exact:true}).inputValue(),'mg/dL');
  assert.equal(await page.getByLabel('Method',{exact:true}).inputValue(),'GOD-POD');
  assert.equal(await page.getByLabel('Low limit',{exact:true}).inputValue(),'70');
  assert.equal(await page.getByLabel('High limit',{exact:true}).inputValue(),'99');
  assert.equal(await page.getByLabel('Age from',{exact:true}).inputValue(),'18');
  await page.getByLabel('Method',{exact:true}).selectOption('__custom');
  await page.getByLabel('Custom method',{exact:true}).fill('Synthetic adjusted method');
  await page.getByLabel('Low limit',{exact:true}).fill('71');
  await page.getByRole('button',{name:'Save investigation',exact:true}).click();
  await page.getByRole('status').filter({hasText:/Investigation (updated|saved)/}).waitFor();
  assert.equal(submitted.parameters[0].method,'Synthetic adjusted method');
  assert.equal(submitted.parameters[0].referenceRanges[0].low,71);
  await page.reload();
  await page.getByRole('heading',{name:'Investigation catalogue',exact:true}).waitFor();
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${catalogue.length} profiles render; pagination/search, numeric/qualitative/narrative panels, editable method/range, reload and mobile layout. Browser uses isolated API fixtures against the running frontend.`);
} finally {await browser.close();}
