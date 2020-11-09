import { expectType, expectError } from 'tsd';
import { NightwatchAPI } from 'nightwatch';
import './percySnapshot';

declare const browser: NightwatchAPI;

expectType<NightwatchAPI>(browser.percySnapshot());
expectType<NightwatchAPI>(browser.percySnapshot('Snapshot name'));
expectType<NightwatchAPI>(browser.percySnapshot('Snapshot name', { widths: [1000] }));

expectError(browser.percySnapshot('Snapshot name', { foo: 'bar' }));
