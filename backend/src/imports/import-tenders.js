import {readFile} from 'node:fs/promises';
import {pool} from '../db/pool.js';
import {inspectBundle,applyBundle} from './import-service.js';
const options=process.argv.slice(2);
const fileIndex=options.indexOf('--file');
if(fileIndex<0 || !options[fileIndex+1]) throw new Error('Provide your private reconciled JSON file with --file /path/to/tenders-import.json');
const file=options[fileIndex+1];
options.splice(fileIndex,2);
if(options.some(o=>!['--apply','--dry-run'].includes(o)) || options.includes('--apply')&&options.includes('--dry-run')) throw new Error('Use --file /path/to/bundle.json with --dry-run (default) or --apply');
const bundle=JSON.parse(await readFile(file,'utf8'));
if(!options.includes('--apply')) {
 console.log(JSON.stringify({mode:'dry-run',...inspectBundle(bundle),policy:bundle.policy},null,2));
 await pool?.end();
} else {
 if(!pool) throw new Error('DATABASE_URL is required; run migrations before importing');
 const client=await pool.connect();
 try {console.log(JSON.stringify({mode:'apply',...await applyBundle(client,bundle)},null,2));}
 catch(e){console.error('Import failed; transaction rolled back.',e.code||e.message);process.exitCode=1;}
 finally{client.release();await pool.end();}
}
