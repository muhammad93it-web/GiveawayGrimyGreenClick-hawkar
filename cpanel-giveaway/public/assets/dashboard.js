(() => {
  const $ = id => document.getElementById(id);
  const el = { notice:$('notice'), setup:$('setup-card'), app:$('app-card'), callback:$('callback'), admin:$('admin-name'), asset:$('asset'), post:$('post'), title:$('prize-title'), count:$('prize-count'), includeReplies:$('include-replies'), status:$('status'), totals:$('totals'), context:$('review-context'), identity:$('identity-note'), importNote:$('import-note'), list:$('participants'), recent:$('recent-comments'), syncNote:$('sync-note'), permissions:$('permissions-note'), reelUrl:$('reel-url'), reelNote:$('reel-note'), checkReel:$('check-reel'), save:$('save'), change:$('change'), start:$('start'), pause:$('pause'), complete:$('complete'), sync:$('sync'), disconnect:$('disconnect'), refresh:$('refresh-token'), checkPermissions:$('check-permissions') };
  const en = document.documentElement.lang === 'en';
  const t = (kurdish, english) => en ? english : kurdish;
  let csrf = '', giveaway = null, changing = false, assets = [];
  const labels = en ? {idle:'Ready',running:'Live',paused:'Paused',completed:'Completed'} : {idle:'ئامادە',running:'ڕاستەوخۆ',paused:'وەستاوە',completed:'کۆتایی هاتووە'};
  const request = async (url, options={}) => {
    const response = await fetch(url, {credentials:'same-origin', ...options, headers:{...(options.headers||{}), ...(csrf ? {'X-CSRF-Token':csrf}: {})}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t('کێشەیەک ڕوویدا.','Something went wrong.'));
    return data;
  };
  const message = (text, error=false) => { el.notice.textContent=text; el.notice.className=`notice${error?' error':''}`; };
  const clearMessage = () => el.notice.className='notice hidden';
  const callbackMessages = {
    connected: 'پەیوەندیی فەیسبووک سەرکەوتوو بوو.',
    cancelled: 'پەیوەستکردن هەڵوەشایەوە یان مۆڵەت نەدرا.',
    expired_state: 'کاتی پشتڕاستکردنەوە تەواو بوو. لە دوگمەی بەستنەوە جارێکی تر دەست پێ بکە.',
    invalid_response: 'گەڕانەوەی فەیسبووک تەواو نەبوو. دووبارە هەوڵ بدەرەوە.',
    configuration: 'ڕێکخستنی Meta لەسەر هۆستەکە تەواو نییە.',
    token_exchange: 'وەرگرتنی مۆڵەتی Meta سەرکەوتوو نەبوو.',
    authorization: 'Meta مۆڵەتی پێویستی نەداوە یان بەسەرچووە.',
    page_access: 'ئەم هەژمارە دەستگەیشتنی بە پەیجی دیاریکراو نییە، یان پەیجەکە لە مۆڵەتەکاندا هەڵنەبژێردراوە.',
    meta_api: 'پەیوەندی بە Meta سەرکەوتوو نەبوو. کەمێک دواتر هەوڵ بدەرەوە.',
    server: 'هەڵەیەکی ناوخۆیی لە گەڕانەوەی Meta ڕوویدا.',
    error: 'پەیوەستکردنی Meta سەرکەوتوو نەبوو.',
  };
  const callbackMessagesEn = {
    connected: 'Facebook Page connected successfully.',
    cancelled: 'Connection was cancelled or access was declined.',
    expired_state: 'The connection timed out during verification. Start again using Connect Facebook.',
    invalid_response: 'Facebook did not complete the redirect. Try again.',
    configuration: 'The server Meta configuration is incomplete.',
    token_exchange: 'Meta could not exchange the authorization code.',
    authorization: 'Meta did not grant the required permissions, or they expired.',
    page_access: 'This account cannot access the configured Page, or that Page was not selected in the permission dialog.',
    meta_api: 'Could not reach Meta. Try again shortly.',
    server: 'A server error occurred during the Meta callback.',
    error: 'Could not connect to Meta.',
  };
  const callbackResult = new URLSearchParams(location.search).get('meta');
  if (callbackResult) {
    const messages = en ? callbackMessagesEn : callbackMessages;
    message(messages[callbackResult] || messages.error, callbackResult !== 'connected');
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete('meta');
    history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }
  const avatar = p => { const d=document.createElement('span'); d.className='avatar'; if(p.profilePictureUrl){const i=document.createElement('img');i.src=p.profilePictureUrl;i.alt='';i.referrerPolicy='no-referrer';i.addEventListener('error',()=>{i.remove();d.textContent=(p.displayName||'ب')[0]});d.append(i)}else d.textContent=(p.displayName||'ب')[0]; return d; };
  const renderRanking = (participants, hasComments) => { el.list.replaceChildren(); if(!participants.length){const li=document.createElement('li');li.className='ranking-empty';li.textContent=hasComments?t('هێشتا هیچ بەشداربوویەک بۆ پیشاندان نییە.','No participants with available profile information yet.'):t('هێشتا هیچ کۆمێنتێک نییە.','No comments yet.');el.list.append(li);return} participants.forEach((p,index)=>{const li=document.createElement('li'),rank=document.createElement('span'),name=document.createElement('span'),count=document.createElement('span');rank.className='rank';rank.textContent='#'+(index+1);name.className='person';name.textContent=p.displayName||t('بێ ناو','Unnamed');count.className='count';count.textContent=p.commentCount;li.append(rank,avatar(p),name,count);el.list.append(li)}) };
  const renderIdentity = data => { const withIdentity=Number(data.commentsWithIdentity||0),withoutIdentity=Number(data.commentsWithoutIdentity||0); el.identity.className='identity-note'+(withoutIdentity?' warning':''); el.identity.textContent=withoutIdentity?t(`${withIdentity+withoutIdentity} کۆمێنت هێنراون، بەڵام Meta ناسنامەی ${withoutIdentity} کۆمێنتی نەداوە. ئەمە پێویستی بە Business Asset User Profile Access و پشکنینی App Review هەیە.`,`${withIdentity+withoutIdentity} comments imported. Meta did not provide a user profile for ${withoutIdentity} of them. Business Asset User Profile Access is pending App Review.`):t(`${withIdentity} کۆمێنت بە ناسنامەی جێگیر هێنراون.`,`${withIdentity} comments include a participant profile.`); };
  const renderImport = data => { const state=data.commentImport||{},pages=Number(data.pagesFetched||state.pageCount||0),count=Number(data.totalComments||0); el.importNote.className='identity-note'+(state.status==='running'||state.status==='failed'?' warning':''); if(state.status==='running'){const phase=state.phase==='replies'?t('وەڵامەکان','Replies'):t('کۆمێنتە سەرەکییەکان','Comments');el.importNote.textContent=t(`${phase} بەردەوامە: ${pages} پەڕە پشکنراوە و ${count} کۆمێنت لە داتای پێشوو هەیە.`,`${phase} import in progress: ${pages} pages checked, ${count} comments imported.`)}else if(state.status==='failed'){el.importNote.textContent=t('هێنانەوە وەستاوە؛ دوگمەی «بەردەوامکردن» دابگرە تا لە هەمان شوێن دووبارە هەوڵ بدرێتەوە.','Import paused after an error. Use Continue importing comments to resume.')}else if(state.status==='complete'){el.importNote.textContent=t(`هێنانەوە تەواو بوو: ${pages} پەڕە و ${count} کۆمێنت.`,`Import complete: ${pages} pages and ${count} comments.`)}else{el.importNote.textContent=t('هێشتا هێنانەوە دەست پێ نەکردووە.','Import has not started yet.')} };
  const renderContext = () => { const asset=assets.find(a=>a.id===el.asset.value); el.context.textContent=asset?t(`پەیج: ${asset.name} (${asset.id})`,`Facebook Page: ${asset.name} (${asset.id})`):''; };
  const renderRecent = comments => {
    el.recent.replaceChildren();
    if (!comments.length) {
      const item=document.createElement('li');item.className='ranking-empty';
      item.textContent=t('هێشتا کۆمێنتێکی خاوەن ناسنامە نییە.','No comments with an available author profile yet.');
      el.recent.append(item);return;
    }
    comments.forEach(comment=>{
      const item=document.createElement('li'),detail=document.createElement('div'),name=document.createElement('strong'),body=document.createElement('p');
      detail.className='comment-detail';name.textContent=comment.displayName||t('بێ ناو','Unnamed');
      body.textContent=comment.message||t('کۆمێنتی بەتاڵ','Comment without text');
      detail.append(name,body);item.append(avatar(comment),detail);el.recent.append(item);
    });
  };
  const loadRecent = async () => renderRecent(await request('/api/giveaways/current/recent-comments'));
  const renderGiveaway = data => { giveaway=data; el.status.textContent=data.exists?labels[data.status]:t('دیارینەکراو','Not set'); el.totals.textContent=t(`${Number(data.totalComments||0)} کۆمێنت · ${Number(data.participantsCount||data.totalParticipants||0)} بەشداربوو`,`${Number(data.totalComments||0)} comments · ${Number(data.participantsCount||data.totalParticipants||0)} participants`); renderIdentity(data);renderImport(data); const identified=(data.participants||[]).filter(p=>p.identityAvailable); renderRanking(identified,Number(data.totalComments||0)>0); el.syncNote.textContent=data.lastError?t(`هەڵەی پێشوو: ${data.lastError}`,`Previous error: ${data.lastError}`):(data.lastSyncedAt?t(`دوا نوێکردنەوە: ${new Date(data.lastSyncedAt).toLocaleString()}`,`Last synced: ${new Date(data.lastSyncedAt).toLocaleString()}`):''); if(data.exists&&!changing){el.asset.value=data.assetId||'';el.title.value=data.prizeTitle||'';el.count.value=data.prizeCount||3;el.includeReplies.value=data.includeReplies===false?'0':'1';el.change.classList.remove('hidden')} else el.change.classList.add('hidden'); renderContext(); const active=!!data.exists; el.start.disabled=!active;el.pause.disabled=!active;el.complete.disabled=!active;el.sync.disabled=!active||data.status==='completed'; };
  const loadPosts = async (assetId, selected='') => { el.post.replaceChildren(new Option(t('-- هەڵبژێرە --','-- Select a post --'),'')); if(!assetId)return; try{const posts=await request('/api/meta/assets/'+encodeURIComponent(assetId)+'/posts');posts.forEach(p=>el.post.add(new Option(p.message?p.message.slice(0,60):t(`پۆستی ${new Date(p.createdAt).toLocaleDateString()}`,`Post from ${new Date(p.createdAt).toLocaleDateString()}`),p.id)));el.post.value=selected}catch(e){message(e.message,true)} };
  const load = async () => { const status=await request('/api/meta/status');csrf=status.csrfToken||csrf;el.callback.textContent=status.callbackUrl||'';if(!status.configured||!status.connected){el.setup.classList.remove('hidden');el.app.classList.add('hidden');return}el.setup.classList.add('hidden');el.app.classList.remove('hidden');el.admin.textContent=status.adminName?t(`بەڕێوەبەر: ${status.adminName}`,`Admin: ${status.adminName}`):'';if(['expired','reconnect_required'].includes(status.tokenStatus))message(t('پەیوەندی Meta پێویستی بە نوێکردنەوەیە.','The Meta connection needs renewal.'),true);assets=await request('/api/meta/assets');const selected=el.asset.value;el.asset.replaceChildren(new Option(t('-- هەڵبژێرە --','-- Select a Page --'),''));assets.forEach(a=>el.asset.add(new Option(`${a.name} (${a.platform==='facebook'?t('فەیسبووک','Facebook'):t('ئینستاگرام','Instagram')})`,a.id)));const current=await request('/api/giveaways/current');renderGiveaway(current);const assetId=current.exists&&!changing?current.assetId:selected;el.asset.value=assetId||'';renderContext();if(assetId)await loadPosts(assetId,current.exists&&!changing?current.postId:'');await loadRecent(); };
  el.asset.addEventListener('change',()=>{renderContext();loadPosts(el.asset.value)});
  el.save.addEventListener('click',async()=>{try{clearMessage();const data=await request('/api/giveaways/current',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId:el.asset.value,postId:el.post.value,prizeTitle:el.title.value,prizeCount:Number(el.count.value),includeReplies:el.includeReplies.value==='1',reset:changing})});changing=false;renderGiveaway(data);await loadPosts(data.assetId,data.postId);await loadRecent();message(t('پاشەکەوت کرا.','Saved.'));}catch(e){message(e.message,true)}});
  el.change.addEventListener('click',()=>{if(confirm(t('پۆست گۆڕاوەکە هەموو ڕیزبەندیی پێشوو پاک دەکات. دڵنیایت؟','Changing the post clears the previous ranking. Continue?'))){changing=true;el.post.value='';el.change.classList.add('hidden');message(t('پۆستی نوێ هەڵبژێرە و پاشەکەوتی بکە.','Select a new post and save.'))}});
  const status = value => async()=>{try{const data=await request('/api/giveaways/current/status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:value})});renderGiveaway(data);message(value==='completed'?(data.status==='completed'?t('خەڵاتەکە بە ئەنجامی کۆتایی گەیشت.','The giveaway has finished.'):t('هێنانی کۆمێنتە پێشووەکان بەردەوامە؛ دوای تەواوبوون خەڵاتەکە خۆکارانە کۆتایی دێت.','Comment import continues; the giveaway will finish automatically afterward.')):t('دۆخی خەڵات نوێ کرا.','Giveaway status updated.'))}catch(e){message(e.message,true)}};
  el.start.addEventListener('click',status('running'));el.pause.addEventListener('click',status('paused'));el.complete.addEventListener('click',status('completed'));
  el.sync.addEventListener('click',async()=>{try{el.sync.disabled=true;const data=await request('/api/giveaways/current/sync',{method:'POST'});renderGiveaway(data);await loadRecent();message(data.commentImport&&data.commentImport.status==='complete'?t('هەموو کۆمێنتە بەردەستەکان نوێ کرانەوە.','All available comments are up to date.'):t('هێنانەوەی کۆمێنتەکان بەردەوام کرا.','Comment import resumed.'))}catch(e){message(e.message,true)}finally{el.sync.disabled=false}});
  el.checkPermissions.addEventListener('click',async()=>{try{el.permissions.textContent=t('لە پشکنینە...','Checking...');const data=await request('/api/meta/permissions'),sample=data.historicalCommentSample,list=items=>items.length?`\n• ${items.join('\n• ')}`:t('\n• هیچ','\n• None');if(en){const sampleText=sample?`\n\nHistorical comment sample:\n• Comment returned: ${sample.commentReturned?'yes':'no'}\n• Author field returned: ${sample.fromPresent?'yes':'no'}\n• Author ID returned: ${sample.fromIdPresent?'yes':'no'}\n• Author name returned: ${sample.fromNamePresent?'yes':'no'}`:'';el.permissions.textContent=`Requested permissions:${list(data.requested)}\n\nGranted permissions:${list(data.granted)}\n\nDeclined or expired:${list([...data.declined,...data.expired])}\n\nPage comment access: ${data.pageCommentAccess==='granted'?'granted':'incomplete'}\n\nBusiness Asset User Profile Access:\nCheck this in Meta App Review; the API does not report it here.${sampleText}`;return}const sampleText=sample?`\n\nنموونەی کۆمێنتی مێژوویی:\n• کۆمێنت: ${sample.commentReturned?'هاتووە':'نەهاتووە'}\n• خانەی from: ${sample.fromPresent?'هاتووە':'نەهاتووە'}\n• ناسنامە: ${sample.fromIdPresent?'هاتووە':'نەهاتووە'}\n• ناو: ${sample.fromNamePresent?'هاتووە':'نەهاتووە'}`:'';el.permissions.textContent=`مۆڵەتە داواکراوەکان:${list(data.requested)}\n\nمۆڵەتە وەرگیراوەکان:${list(data.granted)}\n\nکێشەدار/ڕەتکراو:${list([...data.declined,...data.expired])}\n\nدەستگەیشتنی کۆمێنتی پەیج: ${data.pageCommentAccess==='granted'?'دروست':'تەواو نییە'}\n\nBusiness Asset User Profile Access:\nلە پشکنینی خۆکاردا دیار ناکرێت؛ لە App Review بەدەستی پشکنینی بکە.${sampleText}`}catch(e){el.permissions.textContent=e.message}});
  el.checkReel.addEventListener('click',async()=>{
    el.checkReel.disabled=true;
    el.reelNote.textContent=t('لە پشکنینە...','Checking...');
    try {
      const data=await request('/api/meta/reel-diagnostic?url='+encodeURIComponent(el.reelUrl.value.trim()));
      const names=(data.sampleNames||[]).length?data.sampleNames.map(name=>'• '+name).join('\n'):t('هیچ ناوێک لەم نموونەیەدا نەگەڕایەوە.','No author name returned in this sample.');
      el.reelNote.textContent=t(`پەیج: ${data.pageName} (${data.pageId})\nReel: ${data.reelId}\nکۆمێنتی نموونە: ${data.sampledComments}${data.hasMore?' (پەڕەی تر هەیە)':''}\nخاوەن ناسنامە: ${data.commentsWithAuthorId}\nخاوەن ناو: ${data.commentsWithAuthorName}\nناوە ڕاستەقینە گەڕاوەکان:\n${names}\nبۆ ڕیزبەندی، ناسنامەی نووسەر پێویستە. ئەم پشکنینە خەڵاتەکە ناگۆڕێت.`,`Page: ${data.pageName} (${data.pageId})\nReel: ${data.reelId}\nComments sampled: ${data.sampledComments}${data.hasMore?' (more pages available)':''}\nAuthor IDs returned: ${data.commentsWithAuthorId}\nAuthor names returned: ${data.commentsWithAuthorName}\nNames returned by Meta:\n${names}\nAn author ID is required for ranking. The giveaway is unchanged.`);
    } catch(e) { el.reelNote.textContent=e.message; }
    finally { el.checkReel.disabled=false; }
  });
  el.disconnect.addEventListener('click',async()=>{if(!confirm(t('هەموو داتای خەڵات و کۆمێنتەکان دەسڕێنەوە. دڵنیایت؟','This deletes all giveaway and comment data. Continue?')))return;try{await request('/api/meta/disconnect',{method:'POST'});location.reload()}catch(e){message(e.message,true)}});
  el.refresh.addEventListener('click',()=>location.href='/api/meta/login');
  load().catch(e=>message(e.message,true));setInterval(()=>{if(!document.hidden) request('/api/giveaways/current').then(renderGiveaway).catch(()=>{})},5000);
})();
