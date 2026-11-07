/* Separate thread keeps the board responsive during deep search. */
importScripts('engine.js?v=3');
onmessage=({data})=>{
 try{const engine=new CaroEngine.Search(data.board);postMessage(engine.search(data.player,{maxDepth:data.searchDepth,timeMs:data.timeBudgetMs,useAlphaBeta:data.useAlphaBeta}));}
 catch(error){postMessage({error:error.message});}
};
