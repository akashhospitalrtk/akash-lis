import test from 'node:test';
import assert from 'node:assert/strict';
import { indiaCatalogue } from '../dist/src/data/indiaCatalogue.js';
import { planIndiaCatalogue } from '../dist/src/services/indiaCatalogueService.js';
import { profileSchema } from '../dist/src/schemas/profileSchemas.js';

test('whole catalogue validates and contains no patient/default values',()=>{
  assert.ok(indiaCatalogue.length>300);
  assert.equal(new Set(indiaCatalogue.map(p=>p.code)).size,indiaCatalogue.length);
  for(const profile of indiaCatalogue) {
    profileSchema.parse(profile);
    for(const parameter of profile.parameters) {
      assert.ok(parameter.method,`${profile.code}/${parameter.code} method`);
      assert.ok(!parameter.suggestedValue);
      assert.deepEqual(parameter.commonValues,[]);
      assert.equal(parameter.criticalLow,undefined);
      assert.equal(parameter.criticalHigh,undefined);
      for(const range of parameter.referenceRanges) {
        assert.equal(range.ageMin,18);
        assert.equal(range.ageUnit,'years');
        assert.match(range.label,/example/);
      }
    }
  }
});
test('skip matching names, local aliases and archived profiles; repeated plans add nothing',()=>{
  const existing=[{id:'1',code:'LIVER',name:'Custom liver panel',active:false},{id:'2',code:'CUSTOM_TSH',name:'Thyroid stimulating hormone'}];
  const plan=planIndiaCatalogue(existing);
  assert.ok(plan.skipped.some(p=>p.code==='LFT'));
  assert.ok(plan.skipped.some(p=>p.code==='TSH'));
  assert.equal(existing.length,2);
  assert.equal(planIndiaCatalogue(indiaCatalogue.map((p,i)=>({id:String(i),code:p.code,name:p.name}))).add.length,0);
});
test('panel formulas use same units; three-part CBC does not invent five-part counts',()=>{
  const byCode=new Map(indiaCatalogue.map(p=>[p.code,p]));
  const acr=byCode.get('UR_ACR').parameters;
  assert.equal(acr.find(p=>p.code==='UR_MICROALB').unit,'mg/L');
  assert.equal(acr.find(p=>p.code==='UR_CREAT').unit,'mg/dL');
  assert.equal(acr.find(p=>p.code==='ACR').calculationFormula,'UR_MICROALB / UR_CREAT * 100');
  const cbc=byCode.get('CBC').parameters;
  assert.equal(cbc.length,22);
  assert.ok(cbc.some(p=>p.code==='MID'));
  assert.ok(!cbc.some(p=>/neutrophil|monocyte|eosinophil|basophil/i.test(p.name)));
  assert.equal(byCode.get('HBV_DNA').parameters.find(p=>p.code==='DETECTION').resultKind,'SELECT');
  assert.ok(byCode.get('HBV_DNA').parameters.find(p=>p.code==='LIMITS'));
});
