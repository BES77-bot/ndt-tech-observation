// Generic supporting observation items. The governing procedure controls.
// Item IDs are derived from list position: append new items, never reorder or remove
// (saved responses are keyed by these IDs).

export const DISCLAIMER = 'Inspection requirements, technique parameters, acceptance criteria, and disposition are governed by the applicable current technical data. This observation record documents technician performance and does not replace the governing inspection procedure.';

export const CLASSES = ['Procedural Noncompliance', 'Documentation', 'Equipment / Calibration', 'Technique', 'Process Control', 'Evaluation', 'Other'];

export const OVERALL = [
  'Technician demonstrated satisfactory performance',
  'Procedural deviation(s) observed',
  'Additional observation/training recommended',
  'Unable to complete observation',
  'Other',
];

const RAW = [
  { id: 'prep', step: 'setup', title: 'General Documentation / Preparation', items: [
    'Correct/current procedure available',
    'Correct aircraft/component identified',
    'Correct inspection requirement identified',
    'Technician qualification/certification verified',
    'Required equipment identified',
    'Equipment calibration/current status verified',
    'Required reference standard/process controls available',
    'Applicable acceptance/rejection criteria available',
    'Correct inspection area identified',
    'Required access/removal completed',
    'Surface prepared according to procedure',
    'Inspection surface condition acceptable',
    'Required cleaning completed',
    'Required safety precautions followed',
    'Required inspection coverage understood',
  ] },
  { id: 'mt', step: 'setup', method: 'MT', title: 'MT Setup', items: [
    'Correct MT technique selected',
    'Correct equipment used',
    'Correct magnetic particle materials used',
    'Material/process-control status acceptable',
    'Correct magnetization technique used',
    'Required magnetization direction(s) established',
    'Required process/field verification performed',
    'Required viewing conditions established',
    'Technician understands required inspection coverage',
    'Magnetic particles applied as required',
  ] },
  { id: 'pt', step: 'setup', method: 'PT', title: 'PT/FPI Setup', items: [
    'Correct penetrant system selected',
    'Correct approved materials used',
    'Material expiration/status acceptable',
    'Surface properly cleaned and dried',
    'Penetrant correctly applied',
    'Required dwell requirements followed',
    'Excess penetrant correctly removed',
    'Drying performed as required',
    'Correct developer applied',
    'Required development requirements followed',
    'Required viewing conditions established',
    'Technician understands required inspection coverage',
  ] },
  { id: 'et', step: 'setup', method: 'ET', title: 'ET Setup', items: [
    'Correct ET instrument used',
    'Instrument calibration/current status verified',
    'Correct probe/coil selected',
    'Correct cable/accessories selected',
    'Correct reference standard used',
    'Reference standard identification recorded',
    'Correct frequency established',
    'Correct instrument setup established',
    'Probe nulled/balanced as required',
    'Lift-off response established where required',
    'Reference discontinuity response established',
    'Required sensitivity/gain established',
    'Setup verified before inspection',
    'Setup verified on component where required',
    'Technician understands required scan/inspection coverage',
  ] },
  { id: 'perf', step: 'inspect', title: 'Inspection Performance', items: [
    'Technician followed required procedure sequence',
    'Correct inspection area inspected',
    'Entire required inspection area covered',
    'Required passes/scans/orientations completed',
    'Correct technique maintained throughout inspection',
    'Inspection speed appropriate where applicable',
    'Required overlap/coverage maintained where applicable',
    'Technician recognized relevant responses/indications',
    'Technician appropriately investigated indications',
    'Indication location documented where required',
    'Indication response/size documented where required',
    'Applicable acceptance/rejection criteria referenced',
    'Technician followed required evaluation process',
    'Required results recorded',
    'Inspection repeated/verified where required',
  ] },
  { id: 'comp', step: 'inspect', title: 'Completion', items: [
    'Required post-inspection setup verification completed',
    ['ET reference response rechecked where required', 'ET'],
    ['MT demagnetization completed where required', 'MT'],
    ['MT residual field verification completed where required', 'MT'],
    ['PT post-cleaning completed where required', 'PT'],
    'Required corrosion protection/restoration completed',
    'Inspection area/component properly restored',
    'Inspection documentation completed',
    'Final disposition documented',
    'Required signatures/identification completed',
  ] },
];

// Default Critical Evidence Markers per method, by item ID. These are SUPPORTING prompts only:
// they flag where evidence may be useful and never create a technical requirement on their own.
// N/A remains available; none is mandatory for every procedure.
export const CRITICAL = {
  ET: ['prep1', 'et2', 'et3', 'et6', 'et8', 'et9', 'et10', 'et11', 'et12', 'et14', 'perf5', 'perf3', 'perf13', 'perf12', 'comp1', 'comp2', 'comp8'],
  MT: ['prep1', 'prep6', 'mt3', 'mt4', 'mt7', 'prep11', 'mt5', 'mt6', 'mt10', 'mt8', 'perf3', 'perf13', 'perf12', 'comp3', 'comp4', 'comp8'],
  PT: ['prep1', 'pt2', 'pt3', 'pt4', 'pt5', 'pt6', 'pt7', 'pt8', 'pt9', 'pt10', 'pt11', 'perf3', 'perf13', 'perf12', 'comp5', 'comp8'],
};

export const EVT = { DO: 'Direct Observation', VID: 'Video', PHO: 'Photo', DOC: 'Document / Record', OTH: 'Other' };

export const BASIS_CATS = ['Written Practice / Qualification Program', 'General NDI Standard / Manual', 'Aircraft / Component NDI Procedure', 'Maintenance Technical Data / Work Package', 'Other'];
// Suggestions only. No revision is ever assumed current.
export const BASIS_DOCS = ['Employer Written Practice / Qualification Program', 'NAS 410', 'TM 1-1500-335-23', 'TM 1-1520-265-23', 'Applicable H-60 maintenance technical data / work package'];

export const OJT_RESULTS = ['Satisfactorily Demonstrated', 'Additional Observation Required', 'Not Demonstrated', 'Not Evaluated'];
export const OJT_NOTE = 'Hours are recorded only. This app does not approve or credit OJT/experience hours; final credit is governed by the employer\'s Written Practice / qualification program.';

export const AUTH_TEXT = 'Confirm photography/video is authorized for this location and inspection. Do not record restricted, controlled, proprietary, CUI, export-controlled, or otherwise unauthorized information.';

export const SECTIONS = RAW.map(s => ({
  ...s,
  items: s.items.map((x, i) => Array.isArray(x)
    ? { id: s.id + (i + 1), text: x[0], method: x[1] }
    : { id: s.id + (i + 1), text: x }),
}));
