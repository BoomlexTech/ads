import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseReasons, parseChoice, firstFree, parseAccountField } from './editing.js';
import { ACCOUNT_DEFAULTS, CURRENCY_CODES } from '../shared/account.js';
import { convValuePer, DEFAULT_BUDGET } from './seed.js';
import {
  BASE_METRICS, METRICS, METRIC_SCOPE, EDITABLE, parseInput, formatValue, editText, allowedPattern, solveMetric, sumRows, withDerived,
} from '../shared/metrics.js';
import {
  CAMPAIGN_TYPES, CAMPAIGN_STATUS_LABELS, AD_GROUP_STATUS_LABELS, AD_GROUP_TYPES,
  campaignStatusLabel, adGroupStatusLabel, adGroupType, parseScore, formatScore,
} from '../shared/entities.js';

test('parseMoney reads budgets and target CPAs as cents', () => {
  assert.equal(parseMoney('40'), 4000);
  assert.equal(parseMoney('40.5'), 4050);
  assert.equal(parseMoney('1,200.00'), 120000);
  assert.equal(parseMoney('$1,200.00/day'), 120000);
  assert.equal(parseMoney(' 12,345,678.9 '), 1234567890);
  assert.equal(parseMoney(25), 2500);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('  '), null);
  assert.equal(parseMoney(null), null);
  for (const bad of ['abc', '1.234', '-5', '1,20', '12,34,567', '1e3', '$$4', '4 0', '.']) {
    assert.equal(parseMoney(bad), undefined, bad);
  }
});

test('parseReasons splits, tidies and caps the list', () => {
  assert.deepEqual(parseReasons('Conversion tracking setup is incomplete'), ['Conversion tracking setup is incomplete']);
  assert.deepEqual(parseReasons(' a ,, b\u0007c , '), ['a', 'b c']);
  assert.deepEqual(parseReasons(''), []);
  assert.equal(parseReasons('1,2,3,4,5,6,7,8').length, 6);
  assert.equal(parseReasons('x'.repeat(200))[0].length, 80);
});

test('parseChoice allows blank (automatic) or a listed label', () => {
  assert.equal(parseChoice('', CAMPAIGN_STATUS_LABELS), '');
  assert.equal(parseChoice(' Eligible (Limited) ', CAMPAIGN_STATUS_LABELS), 'Eligible (Limited)');
  assert.equal(parseChoice('Ended', CAMPAIGN_STATUS_LABELS), 'Ended');
  assert.equal(parseChoice('Ended', AD_GROUP_STATUS_LABELS), undefined);
  assert.equal(parseChoice('eligible', CAMPAIGN_STATUS_LABELS), undefined);
  assert.equal(parseChoice('Display', AD_GROUP_TYPES), 'Display');
  assert.equal(parseChoice({}, AD_GROUP_TYPES), undefined);
});

test('firstFree picks the first unused default name', () => {
  assert.equal(firstFree(new Set(), (n) => `Ad group ${n}`), 'Ad group 1');
  assert.equal(firstFree(new Set(['Ad group 1', 'Ad group 3']), (n) => `Ad group ${n}`), 'Ad group 2');
  const camp = (n) => `New Search campaign${n > 1 ? ` ${n}` : ''}`;
  assert.equal(firstFree(new Set(['New Search campaign']), camp), 'New Search campaign 2');
});

test('optimization score parsing and display', () => {
  assert.equal(parseScore('72.4'), 72.4);
  assert.equal(parseScore('81.3%'), 81.3);
  assert.equal(parseScore('100'), 100);
  assert.equal(parseScore(''), null);
  assert.equal(parseScore('100.1'), undefined);
  assert.equal(parseScore('7.25'), undefined);
  assert.equal(parseScore('-1'), undefined);
  assert.equal(formatScore(72.4), '72.4%');
  assert.equal(formatScore(null), '–');
});

test('status labels and ad group type fall back to status / campaign type', () => {
  assert.equal(campaignStatusLabel({ status: 'paused', statusLabel: '' }), 'Paused');
  assert.equal(campaignStatusLabel({ status: 'enabled' }), 'Eligible');
  assert.equal(campaignStatusLabel({ status: 'enabled', statusLabel: 'Eligible (Limited)' }), 'Eligible (Limited)');
  assert.equal(adGroupStatusLabel({ status: 'paused' }), 'Paused');
  assert.equal(adGroupType({ groupType: '' }, 'Search'), 'Standard');
  assert.equal(adGroupType({ groupType: 'Video' }, 'Search'), 'Video');
  assert.equal(adGroupType({}, 'Display'), 'Display');
});

test('every campaign type has a starting budget', () => {
  for (const t of CAMPAIGN_TYPES) assert.ok(DEFAULT_BUDGET[t] > 0, t);
});

test('conversion value is a fifth stored metric', () => {
  assert.deepEqual(BASE_METRICS, ['impressions', 'clicks', 'cost', 'conversions', 'convValue']);
  assert.equal(METRICS.convValue.label, 'Conv. value');
  assert.equal(METRICS.convValue.kind, 'dec2');
  assert.ok(METRICS.convValue.base);
  assert.ok(EDITABLE.has('convValue')); // admins can type figures in
  assert.equal(formatValue('convValue', 0), '0.00');
  assert.equal(formatValue('convValue', 123456), '1,234.56');
  assert.equal(formatValue('convValue', null), '–');
  assert.equal(parseInput('convValue', '1234.5'), 123450);
  assert.equal(parseInput('convValue', '1,234'), undefined);
  assert.equal(editText('convValue', 123456), '1234.56');
  assert.ok(allowedPattern('convValue').test('12.3'));
  assert.ok(!allowedPattern('convValue').test('12.345'));
  assert.deepEqual(solveMetric('convValue', 5000, {}), { base: 'convValue', total: 5000 });
  const t = sumRows([{ convValue: 100 }, { convValue: null }, { convValue: 250 }]);
  assert.equal(t.convValue, 350);
  assert.equal(sumRows([{ convValue: null }]).convValue, null);
  assert.equal(withDerived({ impressions: 1, clicks: 1, cost: 1, conversions: 100, convValue: 4000 }).convValue, 4000);
});

test('Conv. value / Cost (Platform Comparable) covers Demand Gen ads only', () => {
  assert.equal(METRIC_SCOPE.convValueCostPlatform, 'demandgen');
  assert.ok(EDITABLE.has('convValueCostPlatform'));
  assert.ok(!/no conversion values/.test(METRICS.convValueCostPlatform.formula));
  const rows = [
    { campaignType: 'Demand Gen', format: 'video', cost: 20000, convValue: 50000 },
    { campaignType: 'Demand Gen', format: 'image', cost: 5000, convValue: null },
    { campaignType: 'Search', format: 'text', cost: 99999, convValue: 77777 },
  ];
  const t = sumRows(rows);
  assert.equal(t.pValue, 50000);
  assert.equal(t.pCost, 25000);
  assert.equal(formatValue('convValueCostPlatform', withDerived(t).convValueCostPlatform), '200.00%');
  // A single row works through withDerived alone (the client's per-row path).
  assert.equal(formatValue('convValueCostPlatform', withDerived(rows[0]).convValueCostPlatform), '250.00%');
  // Zero value on Demand Gen spend is 0%, not a dash; no Demand Gen spend is a dash.
  assert.equal(formatValue('convValueCostPlatform', withDerived({ campaignType: 'Demand Gen', cost: 100, convValue: 0 }).convValueCostPlatform), '0.00%');
  assert.equal(formatValue('convValueCostPlatform', withDerived(rows[2]).convValueCostPlatform), '–');
  assert.equal(sumRows([rows[2]]).pValue, null);
  // Edits get sums already narrowed to the Demand Gen ads (METRIC_SCOPE):
  // typing 120% on $250.00 of Demand Gen cost asks for 300.00 of conv. value.
  const dg = sumRows(rows.slice(0, 2));
  const v = parseInput('convValueCostPlatform', '120');
  assert.deepEqual(solveMetric('convValueCostPlatform', v, dg), { base: 'convValue', total: 30000 });
  assert.equal(solveMetric('convValueCostPlatform', v, { ...dg, cost: null }).error, 'Needs cost first');
});

test('value per conversion is fixed per ad and between 20 and 60', () => {
  for (let i = 0; i < 100; i++) {
    const v = convValuePer(i);
    assert.ok(Number.isInteger(v) && v >= 20 && v <= 60, String(v));
    assert.equal(convValuePer(i), v);
  }
  assert.equal(convValuePer(undefined), convValuePer(0));
});

test('account details: the app card link must be a full https link', () => {
  const bad = (field, value, msg) => assert.throws(() => parseAccountField(field, value), (e) => e.status === 400 && msg.test(e.message), `${field}: ${value}`);
  assert.equal(parseAccountField('appUrl', ' https://example.com/app?id=1 '), 'https://example.com/app?id=1');
  assert.equal(parseAccountField('appUrl', ''), '');
  assert.equal(parseAccountField('appUrl', '   '), '');
  for (const v of ['http://example.com/app', 'example.com/app', 'https://', 'https:example.com', 'ftp://example.com',
    'https://exa mple.com', 'https://localhost/app', 'javascript:alert(1)', 'https://user:pw@example.com/', 'https://example.com/a\nb']) {
    bad('appUrl', v, /starts with https:\/\//);
  }
  bad('appUrl', `https://example.com/${'a'.repeat(190)}`, /up to 200 characters/);
  assert.equal(parseAccountField('appUrl', `https://example.com/${'a'.repeat(180)}`).length, 200);
  bad('appUrl', 42, /Enter some text/);
});

test('account details: app card wording falls back to the standard text when cleared', () => {
  assert.equal(parseAccountField('appTitle', '  Our  app '), 'Our app');
  assert.equal(parseAccountField('appTitle', ''), ACCOUNT_DEFAULTS.appTitle);
  assert.equal(parseAccountField('appTitle', 'x'.repeat(80)).length, 60);
  assert.equal(parseAccountField('appText', ' '), ACCOUNT_DEFAULTS.appText);
  assert.equal(parseAccountField('appText', 'y'.repeat(200)).length, 160);
});

test('account details: billing profile fields are checked and tidied', () => {
  const bad = (field, value, msg) => assert.throws(() => parseAccountField(field, value), (e) => e.status === 400 && msg.test(e.message), `${field}: ${value}`);
  assert.equal(parseAccountField('billingName', ' Green  Fields Co '), 'Green Fields Co');
  assert.equal(parseAccountField('billingName', ''), '');
  assert.equal(parseAccountField('billingName', 'n'.repeat(150)).length, 100);
  // Addresses keep their lines (blank ones dropped), up to 300 characters.
  assert.equal(parseAccountField('billingAddress', ' 12 Main St \r\n\n  Springfield\t 12345 \n'), '12 Main St\nSpringfield 12345');
  assert.equal(parseAccountField('billingAddress', 'a'.repeat(400)).length, 300);
  assert.equal(parseAccountField('billingAddress', Array.from({ length: 12 }, (_, i) => `Line ${i}`).join('\n')).split('\n').length, 8);
  assert.equal(parseAccountField('billingEmail', ' billing@example.com '), 'billing@example.com');
  assert.equal(parseAccountField('billingEmail', ''), '');
  bad('billingEmail', 'billing@example', /email address/);
  bad('billingEmail', `${'b'.repeat(200)}@example.com`, /up to 200 characters/);
  assert.equal(parseAccountField('billingPhone', '+1 (555) 010-0100'), '+1 (555) 010-0100');
  assert.equal(parseAccountField('billingPhone', ''), '');
  bad('billingPhone', 'call me', /phone number/);
  bad('billingPhone', '12', /phone number/);
  bad('billingPhone', '1'.repeat(41), /up to 40 characters/);
  assert.equal(parseAccountField('taxId', '29ABCDE1234F1Z5'), '29ABCDE1234F1Z5');
  assert.equal(parseAccountField('taxId', 'GB 123 4567 89'), 'GB 123 4567 89');
  bad('taxId', '<b>', /letters, numbers/);
  bad('taxId', 'T'.repeat(41), /up to 40 characters/);
  for (const c of CURRENCY_CODES) assert.equal(parseAccountField('currency', c), c);
  bad('currency', 'usd', /Pick a currency/);
  bad('currency', 'BTC', /Pick a currency/);
  assert.deepEqual(CURRENCY_CODES, ['USD', 'INR', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED']);
  assert.equal(ACCOUNT_DEFAULTS.currency, 'USD');
});

test('account details: the top bar fields keep their rules; unknown fields are refused', () => {
  const bad = (field, value, msg) => assert.throws(() => parseAccountField(field, value), (e) => e.status === 400 && msg.test(e.message), `${field}: ${value}`);
  assert.equal(parseAccountField('id', '111-222-3333'), '111-222-3333');
  bad('id', '1112223333', /123-456-7890/);
  bad('name', '  ', /Enter some text/);
  bad('email', 'nope', /email address/);
  assert.equal(parseAccountField('avatar', ''), '');
  bad('avatar', 'https://example.com/a.png', /Upload a photo/);
  for (const f of ['balance', 'invoice', 'cardNumber', 'avatarMedia', '__proto__', undefined]) bad(f, 'x', /can’t be edited/);
});
