import {assign,fromPromise,setup} from 'xstate';
export const reviewInsightsMachine=setup({
  actors:{load:fromPromise(async({input,signal})=>{const result=await input.load(input.request,signal);if(result.status!=='ok'||result.repo!==input.request.repo||result.base!==input.request.base||result.head!==input.request.head)throw Error('Insights belong to another comparison.');return result;})},
  guards:{hasRequest:({context})=>Boolean(context.request)},
}).createMachine({
  id:'review-insights',initial:'idle',context:({input})=>({load:input.load,request:null,result:null,error:'',file:null,tab:'change'}),
  on:{
    LOAD:{target:'.loading',reenter:true,actions:assign(({event})=>({request:event.request,result:null,error:'',file:null,tab:'change'}))},
    CANCEL:{target:'.idle',actions:assign({request:null,result:null,error:'',file:null,tab:'change'})},
    OPEN:{actions:assign(({event})=>({file:event.path,tab:'change'}))},
    CLOSE:{actions:assign({file:null})},
    TAB:{guard:({context,event})=>Boolean(context.file)&&['change','history','dependencies'].includes(event.tab),actions:assign(({event})=>({tab:event.tab}))},
    RETRY:{guard:'hasRequest',target:'.loading',reenter:true,actions:assign({result:null,error:''})},
  },
  states:{idle:{},loading:{invoke:{src:'load',input:({context})=>({load:context.load,request:context.request}),onDone:{target:'ready',actions:assign(({event})=>({result:event.output,error:''}))},onError:{target:'error',actions:assign(({event})=>({result:null,error:event.error?.message ?? 'Review insights unavailable.'}))}}},ready:{},error:{}},
});
