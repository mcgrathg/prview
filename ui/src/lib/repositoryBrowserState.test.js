import {test,expect} from 'bun:test';
import {repositoryCommand} from './repositoryBrowserState.js';
test('repository commands accept platform shortcuts and yield unrelated or composing input',()=>{
 expect(repositoryCommand({key:'p',metaKey:true})).toBe('files');expect(repositoryCommand({key:'F',ctrlKey:true,shiftKey:true})).toBe('text');expect(repositoryCommand({key:'O',metaKey:true,shiftKey:true})).toBe('symbols');
 for(const event of [{key:'p'},{key:'P',metaKey:true,shiftKey:true},{key:'f',metaKey:true},{key:'p',metaKey:true,altKey:true},{key:'p',metaKey:true,isComposing:true}])expect(repositoryCommand(event)).toBeNull();
});
