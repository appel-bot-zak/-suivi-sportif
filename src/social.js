/* ==================== Social (Supabase) ====================
   Volet optionnel : sans compte, tout le reste de l'app fonctionne
   normalement, en local, hors ligne. Supabase ne reçoit qu'un résumé
   minimal (niveau, XP, noms de quelques badges, date+durée de la
   dernière séance) — jamais le détail des séries/charges/reps.
   La sécurité vient entièrement des policies RLS côté serveur : la clé
   "anon" ci-dessous est publique par design chez Supabase.
   Voir roadmap-social.md et scripts/supabase_social_schema.sql.
*/
const SUPABASE_URL='https://czhteqpnhiytpbhoywxh.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6aHRlcXBuaGl5dHBiaG95d3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NDEwMzIsImV4cCI6MjEwNjMxNzAzMn0.X-rHfXvi-nT9eXnmhpj3qC6AG9ttKVSEVxywVZ2myQw';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let SOC={user:null,profile:null,friends:[],incoming:[],outgoing:[],feed:[],wavedEventIds:new Set(),unseenWaves:[],ready:false,busy:false};

/* ---------- session ---------- */
async function socInit(){
  try{
    const{data:{session}}=await sb.auth.getSession();
    await socApplySession(session);
  }catch(e){}
  SOC.ready=true;
  if(view==='amis')renderAmis();
  sb.auth.onAuthStateChange((_event,session)=>{
    socApplySession(session).then(()=>{if(view==='amis')renderAmis();});
  });
  socRetryPendingSync();
  window.addEventListener('online',socRetryPendingSync);
}
async function socApplySession(session){
  SOC.busy=true;
  if(session){
    SOC.user=session.user;
    await socLoadProfile();
    await socLoadFriends();
  }else{
    SOC.user=null;SOC.profile=null;SOC.friends=[];SOC.incoming=[];SOC.outgoing=[];
    SOC.feed=[];SOC.wavedEventIds=new Set();SOC.unseenWaves=[];
  }
  SOC.busy=false;
  socUpdateNavBadge();
}
async function socLoadProfile(){
  if(!SOC.user){SOC.profile=null;return;}
  const{data}=await sb.from('profiles').select('id,pseudo').eq('id',SOC.user.id).maybeSingle();
  SOC.profile=data||null;
}
async function socSignUp(email,pass,pseudo){
  const{data,error}=await sb.auth.signUp({email,password:pass});
  if(error)throw error;
  const uid=data.user&&data.user.id;
  if(uid){
    const{error:perr}=await sb.from('profiles').insert({id:uid,pseudo:pseudo});
    if(perr)throw perr;
  }
  await socApplySession(data.session);
}
async function socSignIn(email,pass){
  const{data,error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error)throw error;
  await socApplySession(data.session);
}
async function socSignOut(){
  await sb.auth.signOut();
  await socApplySession(null);
}

/* ---------- recherche & demandes d'ami ---------- */
async function socSearchPseudo(q){
  const{data,error}=await sb.rpc('search_profile',{q});
  if(error)throw error;
  return data||[];
}
async function socSendRequest(targetId){
  if(targetId===SOC.user.id)throw new Error("C'est toi.");
  const dejaIncoming=SOC.incoming.find(x=>x.userId===targetId);
  if(dejaIncoming)return socAccept(dejaIncoming.relId); // demande réciproque : on accepte direct
  if(SOC.friends.find(x=>x.userId===targetId)||SOC.outgoing.find(x=>x.userId===targetId))return;
  const{error}=await sb.from('friendships').insert({requester_id:SOC.user.id,addressee_id:targetId});
  if(error)throw error;
  await socLoadFriends();
}
async function socAccept(relId){
  const{error}=await sb.from('friendships').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',relId);
  if(error)throw error;
  await socLoadFriends();
}
async function socRemove(relId){
  const{error}=await sb.from('friendships').delete().eq('id',relId);
  if(error)throw error;
  await socLoadFriends();
}
async function socLoadFriends(){
  if(!SOC.user){SOC.friends=[];SOC.incoming=[];SOC.outgoing=[];return;}
  const{data,error}=await sb.from('friendships')
    .select('id,requester_id,addressee_id,status')
    .or(`requester_id.eq.${SOC.user.id},addressee_id.eq.${SOC.user.id}`);
  if(error){SOC.friends=[];SOC.incoming=[];SOC.outgoing=[];return;}
  const accepted=[],incoming=[],outgoing=[];
  for(const f of data||[]){
    const otherId=f.requester_id===SOC.user.id?f.addressee_id:f.requester_id;
    if(f.status==='accepted')accepted.push({relId:f.id,userId:otherId});
    else if(f.requester_id===SOC.user.id)outgoing.push({relId:f.id,userId:otherId});
    else incoming.push({relId:f.id,userId:otherId});
  }
  const ids=[...new Set([...accepted,...incoming,...outgoing].map(x=>x.userId))];
  const pseudos={};
  if(ids.length){
    const{data:profs}=await sb.from('profiles').select('id,pseudo').in('id',ids);
    (profs||[]).forEach(p=>pseudos[p.id]=p.pseudo);
  }
  const summaries={};
  if(accepted.length){
    const{data:sums}=await sb.from('session_summaries').select('*').in('user_id',accepted.map(a=>a.userId));
    (sums||[]).forEach(s=>summaries[s.user_id]=s);
  }
  SOC.friends=accepted.map(a=>({relId:a.relId,userId:a.userId,pseudo:pseudos[a.userId]||'—',summary:summaries[a.userId]||null}));
  SOC.incoming=incoming.map(i=>({relId:i.relId,userId:i.userId,pseudo:pseudos[i.userId]||'—'}));
  SOC.outgoing=outgoing.map(o=>({relId:o.relId,userId:o.userId,pseudo:pseudos[o.userId]||'—'}));
  await socLoadFeed();
  await socLoadUnseenWaves();
  socUpdateNavBadge();
}

/* ---------- fil d'activité & coucous ---------- */
async function socLoadFeed(){
  if(!SOC.user||!SOC.friends.length){SOC.feed=[];SOC.wavedEventIds=new Set();return;}
  const friendIds=SOC.friends.map(f=>f.userId);
  const since=new Date(Date.now()-30*864e5).toISOString();
  const{data,error}=await sb.from('activity_events').select('id,user_id,type,payload,created_at')
    .in('user_id',friendIds).gte('created_at',since).order('created_at',{ascending:false}).limit(50);
  if(error){SOC.feed=[];SOC.wavedEventIds=new Set();return;}
  SOC.feed=data||[];
  if(SOC.feed.length){
    const{data:mine}=await sb.from('waves').select('event_id').eq('sender_id',SOC.user.id).in('event_id',SOC.feed.map(e=>e.id));
    SOC.wavedEventIds=new Set((mine||[]).map(w=>w.event_id));
  }else SOC.wavedEventIds=new Set();
}
async function socLoadUnseenWaves(){
  if(!SOC.user){SOC.unseenWaves=[];return;}
  const{data}=await sb.from('waves').select('id,sender_id,created_at').eq('recipient_id',SOC.user.id).eq('seen',false);
  SOC.unseenWaves=data||[];
}
function socMarkWavesSeen(){
  if(!SOC.unseenWaves.length)return;
  const ids=SOC.unseenWaves.map(w=>w.id);
  SOC.unseenWaves=[];
  sb.from('waves').update({seen:true}).in('id',ids).then(()=>{},()=>{});
  socUpdateNavBadge();
}
async function socUiSendWave(eventId,recipientId){
  if(SOC.wavedEventIds.has(eventId))return;
  SOC.wavedEventIds.add(eventId); // optimiste ; un seul coucou par événement (contrainte unique côté serveur)
  renderAmis();
  try{
    const{error}=await sb.from('waves').insert({sender_id:SOC.user.id,recipient_id:recipientId,event_id:eventId});
    if(error&&!/duplicate|unique/i.test(error.message||''))throw error;
  }catch(e){SOC.wavedEventIds.delete(eventId);renderAmis();toast(socFriendlyErr(e));}
}
function socWaveBanner(){
  if(!SOC.unseenWaves.length)return'';
  const pseudos={};SOC.friends.forEach(f=>pseudos[f.userId]=f.pseudo);
  const noms=[...new Set(SOC.unseenWaves.map(w=>pseudos[w.sender_id]||'Un ami'))];
  let txt;
  if(noms.length===1)txt=`👋 <b>${esc(noms[0])}</b> t'a fait coucou`;
  else if(noms.length===2)txt=`👋 <b>${esc(noms[0])}</b> et <b>${esc(noms[1])}</b> t'ont fait coucou`;
  else txt=`👋 <b>${esc(noms[0])}</b> et ${noms.length-1} autres t'ont fait coucou`;
  return`<div class="card pad" style="margin-top:16px;cursor:pointer" onclick="renderAmis()">${txt}</div>`;
}
function socFeedLabel(ev,pseudo){
  const p=ev.payload||{};
  if(ev.type==='session')return`🏋️ <b>${esc(pseudo)}</b> a terminé une séance <span class="mu">(${p.duree} min)</span>`;
  if(ev.type==='badge')return`🏆 <b>${esc(pseudo)}</b> a débloqué <b>${esc(p.nom)}</b>`;
  if(ev.type==='record')return`📈 <b>${esc(pseudo)}</b> a battu un record sur <b>${esc(p.exercice)}</b>`;
  if(ev.type==='levelup')return`⬆️ <b>${esc(pseudo)}</b> est passé niveau <b>${p.niveau}</b>`;
  return'';
}
function socFeedDeduped(){
  // une ligne par ami : ne garder que l'événement le plus récent de chacun
  // (SOC.feed est déjà trié du plus récent au plus ancien)
  const vus=new Set(),out=[];
  for(const ev of SOC.feed){
    if(vus.has(ev.user_id))continue;
    vus.add(ev.user_id);out.push(ev);
  }
  return out;
}
function socFeedSection(){
  const feed=socFeedDeduped();
  if(!feed.length)return'';
  const pseudos={};SOC.friends.forEach(f=>pseudos[f.userId]=f.pseudo);
  return`<div class="sect">Fil d'activité</div>
  <div class="card pad">${feed.map(ev=>`
    <div class="row">
      <div class="t" style="font-size:13px">${socFeedLabel(ev,pseudos[ev.user_id]||'—')}
        <span class="mu" style="display:block;font-size:11px;margin-top:2px">${socFmtDate(ev.created_at)}</span></div>
      <button class="iconbtn" title="${SOC.wavedEventIds.has(ev.id)?'Coucou envoyé':'Faire coucou'}"
        ${SOC.wavedEventIds.has(ev.id)?'disabled':''}
        onclick="socUiSendWave('${ev.id}','${ev.user_id}')">${SOC.wavedEventIds.has(ev.id)?'✅':'👋'}</button>
    </div>`).join('')}</div>`;
}

/* ---------- synchro après séance ---------- */
function socRecordBadgeOrder(nouveaux){
  if(!nouveaux||!nouveaux.length)return;
  const ordre=S.cfg.badgesOrder||[];
  for(const b of nouveaux)if(!ordre.includes(b.nom))ordre.push(b.nom);
  S.cfg.badgesOrder=ordre;
}
function socBadgesInfo(st){
  const ordre=S.cfg.badgesOrder||[];
  const actuels=BADGES.filter(b=>b.v(st)>=(b.cible||st.photosTotal||1)).map(b=>b.nom);
  for(const nom of actuels)if(!ordre.includes(nom))ordre.push(nom); // rattrapage badges déjà débloqués avant ce suivi
  S.cfg.badgesOrder=ordre;
  const tous=ordre.filter(n=>actuels.includes(n));
  return{recents:tous.slice(-4),tous:tous};
}
/* Tendance de volume sur 4 semaines, exprimée en mots seulement (jamais un chiffre) :
   compare les 2 semaines écoulées aux 2 précédentes. */
function socVolumeTrend(){
  const parSemaine={};
  for(const s of S.log){
    const w=semaineISO(s.date);let v=0;
    for(const e of s.ex){if(e.cardio||!e.series)continue;for(const x of e.series)v+=x.poids*x.reps;}
    parSemaine[w]=(parSemaine[w]||0)+v;
  }
  const now=new Date(),semaines=[];
  for(let i=0;i<4;i++){const d=new Date(now);d.setDate(d.getDate()-7*i);semaines.push(parSemaine[semaineISO(d)]||0);}
  const recent=semaines[0]+semaines[1],avant=semaines[2]+semaines[3];
  if(recent===0)return'pause';
  if(avant===0||recent>avant*1.1)return'hausse';
  if(recent<avant*0.75)return'pause';
  return'stable';
}
async function socSyncSession(dureeMin,apres,nouveaux,prs,leveledUp){
  socRecordBadgeOrder(nouveaux);
  const{recents,tous}=socBadgesInfo(apres);
  const tendance=socVolumeTrend();
  saveCfg();
  if(!SOC.user)return;
  const payload={user_id:SOC.user.id,niveau:apres.niveau.n,xp:apres.xp,
    last_session_at:new Date().toISOString(),last_session_duree:dureeMin,
    badges:recents,all_badges:tous,serie_hebdo:apres.serie,tendance_volume:tendance,
    updated_at:new Date().toISOString()};
  const events=[{user_id:SOC.user.id,type:'session',payload:{duree:dureeMin}}];
  for(const b of(nouveaux||[]))events.push({user_id:SOC.user.id,type:'badge',payload:{nom:b.nom}});
  for(const p of(prs||[]))events.push({user_id:SOC.user.id,type:'record',payload:{exercice:p.nom}});
  if(leveledUp)events.push({user_id:SOC.user.id,type:'levelup',payload:{niveau:apres.niveau.n}});
  try{
    const{error}=await sb.from('session_summaries').upsert(payload);
    if(error)throw error;
    console.log('[social] résumé synchronisé',payload);
    const{error:eerr}=await sb.from('activity_events').insert(events);
    if(eerr)throw eerr; // le résumé est déjà enregistré même si ceci échoue : voir le catch plus bas
    console.log('[social] événements du fil insérés',events);
    await kdel('kv','socialPending');
  }catch(e){
    console.error('[social] échec de synchro (résumé et/ou événements), mis en attente pour retry :',e);
    await kset('kv','socialPending',{summary:payload,events:events});
  }
}
async function socRetryPendingSync(){
  if(!SOC.user||!navigator.onLine)return;
  let pending=await kget('kv','socialPending');
  if(!pending)return;
  if(pending.user_id&&!pending.summary)pending={summary:pending,events:[]}; // compat avec l'ancien format
  if(!pending.summary||pending.summary.user_id!==SOC.user.id)return;
  console.log('[social] retry de la synchro en attente',pending);
  try{
    const{error}=await sb.from('session_summaries').upsert(pending.summary);
    if(error)throw error;
    if(pending.events&&pending.events.length){
      const{error:eerr}=await sb.from('activity_events').insert(pending.events);
      if(eerr)throw eerr;
    }
    console.log('[social] retry réussi');
    await kdel('kv','socialPending');
  }catch(e){console.error('[social] retry a échoué, reste en attente :',e);}
}

/* ---------- rendu : onglet Amis ---------- */
function socFmtDate(iso){
  const d=new Date(iso);
  return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+' à '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function socFriendlyErr(e){
  const m=(e&&e.message)||'';
  if(/duplicate|unique/i.test(m))return 'Ce pseudo ou cet email est déjà utilisé.';
  if(/invalid login/i.test(m))return 'Email ou mot de passe incorrect.';
  if(/password/i.test(m)&&/6/.test(m))return 'Mot de passe : 6 caractères minimum.';
  return m||'Une erreur est survenue.';
}
function socUpdateNavBadge(){
  const dot=$('#amisDot');if(!dot)return;
  const n=SOC.incoming.length; // les coucous non lus ont leur propre bannière, pas de compteur ici
  dot.textContent=n>9?'9+':String(n);
  dot.classList.toggle('hide',!n);
}
function renderAmis(){
  const v=$('#v-amis');if(!v)return;
  if(!SOC.user){
    v.innerHTML=`
    <div class="card pad" style="margin-top:16px">
      <b style="font-size:17px">Amis</b>
      <div class="mu" style="font-size:13px;margin:6px 0 4px">Connecte-toi pour ajouter des amis et voir leur progression. Le reste de l'appli continue de fonctionner sans compte.</div>
      <div class="field"><label>Email</label><input type="email" id="soc_email" style="width:170px;text-align:left" placeholder="toi@mail.com"></div>
      <div class="field"><label>Mot de passe</label><input type="password" id="soc_pass" style="width:170px;text-align:left" placeholder="6 caractères min."></div>
      <div class="field"><label>Pseudo<span>Uniquement pour créer un compte</span></label><input type="text" id="soc_pseudo" style="width:170px;text-align:left" placeholder="Ex : Zak91"></div>
      <div class="warn hide" id="soc_err" style="border-color:var(--pr);margin-top:12px"></div>
      <button class="btn sm" onclick="socUiSignIn()">Se connecter</button>
      <button class="btn sm ghost" onclick="socUiSignUp()">Créer un compte</button>
    </div>`;
    return;
  }
  if(SOC.busy&&!SOC.profile){
    v.innerHTML='<div class="empty" style="margin-top:16px">Chargement…</div>';
    return;
  }
  v.innerHTML=`
  ${socWaveBanner()}
  <div class="card pad" style="margin-top:16px">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="lvlic" style="width:38px;height:38px;font-size:15px">${esc((SOC.profile&&SOC.profile.pseudo||'?')[0].toUpperCase())}</div>
      <div style="flex:1;min-width:0"><b>${esc(SOC.profile?SOC.profile.pseudo:'…')}</b><div class="mu" style="font-size:12px">${esc(SOC.user.email)}</div></div>
      <button class="iconbtn" title="Déconnexion" onclick="socUiSignOut()">⎋</button>
    </div>
  </div>

  ${socFeedSection()}

  <div class="card pad">
    <b style="font-size:14.5px">Ajouter un ami</b>
    <input class="search" id="soc_search" placeholder="Pseudo ou email…" oninput="socUiSearchDebounced(this.value)">
    <div id="soc_searchres"></div>
  </div>

  ${SOC.incoming.length?`<div class="sect">Demandes reçues — ${SOC.incoming.length}</div>
  <div class="card pad">${SOC.incoming.map(r=>`
    <div class="plan">
      <div class="n">👤</div>
      <div style="flex:1;min-width:0"><b>${esc(r.pseudo)}</b></div>
      <button class="btn sm" style="margin:0;width:auto;padding:8px 12px" onclick="socUiAccept('${r.relId}')">Accepter</button>
      <button class="x" onclick="socUiRemove('${r.relId}')" title="Refuser">✕</button>
    </div>`).join('')}</div>`:''}

  ${SOC.outgoing.length?`<div class="sect">Demandes envoyées</div>
  <div class="card pad">${SOC.outgoing.map(r=>`
    <div class="plan"><div class="n">👤</div><div style="flex:1;min-width:0"><b>${esc(r.pseudo)}</b></div>
    <span class="mu" style="font-size:12px">En attente</span>
    <button class="x" onclick="socUiRemove('${r.relId}')" title="Annuler">✕</button></div>`).join('')}</div>`:''}

  <div class="sect">Amis — ${SOC.friends.length}</div>
  ${SOC.friends.length?`<div class="card pad">${SOC.friends.map(f=>`
    <button class="plan" style="width:100%;text-align:left" onclick="socUiOpenFriend('${f.userId}')">
      <div class="n">${f.summary?f.summary.niveau:'—'}</div>
      <div style="flex:1;min-width:0"><b>${esc(f.pseudo)}</b>
        <div class="mu" style="font-size:12px">${f.summary?('Dernière séance : '+socFmtDate(f.summary.last_session_at)):'Aucune séance synchronisée'}</div></div>
    </button>`).join('')}</div>`
    :'<div class="empty"><span class="ic">👥</span>Aucun ami pour l’instant.<br>Cherche un pseudo ci-dessus pour envoyer une demande.</div>'}
  <div style="height:20px"></div>`;
  socMarkWavesSeen(); // l'onglet Amis vient d'être ouvert : les coucous en attente sont considérés vus
}
function socUiErr(msg){const e=$('#soc_err');if(!e)return;e.textContent=msg;e.classList.remove('hide');}
async function socUiSignIn(){
  const email=$('#soc_email').value.trim(),pass=$('#soc_pass').value;
  if(!email||!pass)return socUiErr('Email et mot de passe requis.');
  try{await socSignIn(email,pass);renderAmis();toast('Connecté(e)');}
  catch(e){socUiErr(socFriendlyErr(e));}
}
async function socUiSignUp(){
  const email=$('#soc_email').value.trim(),pass=$('#soc_pass').value,pseudo=$('#soc_pseudo').value.trim();
  if(!email||!pass)return socUiErr('Email et mot de passe requis.');
  if(pass.length<6)return socUiErr('Mot de passe : 6 caractères minimum.');
  if(!pseudo)return socUiErr('Choisis un pseudo.');
  try{await socSignUp(email,pass,pseudo);renderAmis();toast('Compte créé');}
  catch(e){socUiErr(socFriendlyErr(e));}
}
async function socUiSignOut(){await socSignOut();renderAmis();}
let socSearchT=null;
function socUiSearchDebounced(q){clearTimeout(socSearchT);socSearchT=setTimeout(()=>socUiSearch(q),350);}
async function socUiSearch(q){
  q=(q||'').trim();
  const box=$('#soc_searchres');if(!box)return;
  if(!q){box.innerHTML='';return;}
  try{
    const res=await socSearchPseudo(q);
    if(!res.length){box.innerHTML='<div class="mu" style="padding:10px 0;font-size:13px">Aucun utilisateur trouvé.</div>';return;}
    box.innerHTML=res.map(r=>r.id===SOC.user.id
      ?'<div class="mu" style="padding:10px 0;font-size:13px">C’est toi 🙂</div>'
      :`<button class="opt" onclick="socUiSendRequest('${r.id}')"><div class="t"><b>${esc(r.pseudo)}</b></div><span class="pill">Ajouter</span></button>`
    ).join('');
  }catch(e){box.innerHTML='<div class="mu" style="padding:10px 0;font-size:13px">Recherche indisponible.</div>';}
}
async function socUiSendRequest(id){
  try{await socSendRequest(id);$('#soc_search').value='';$('#soc_searchres').innerHTML='';renderAmis();toast('Demande envoyée');}
  catch(e){toast(socFriendlyErr(e));}
}
async function socUiAccept(relId){try{await socAccept(relId);renderAmis();toast('Ami ajouté');}catch(e){toast(socFriendlyErr(e));}}
async function socUiRemove(relId){try{await socRemove(relId);renderAmis();}catch(e){toast(socFriendlyErr(e));}}
async function socUiOpenFriend(userId){
  const f=SOC.friends.find(x=>x.userId===userId);if(!f)return;
  const s=f.summary;
  let lastEvent=null;
  try{
    const{data,error}=await sb.from('activity_events').select('id,type,payload,created_at')
      .eq('user_id',userId).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error)console.error('[social] recherche du dernier événement de',f.pseudo,'a échoué :',error);
    else console.log('[social] dernier événement de',f.pseudo,'(userId='+userId+') :',data);
    lastEvent=data||null;
  }catch(e){console.error('[social] exception en cherchant le dernier événement de',f.pseudo,':',e);}
  let waved=lastEvent&&SOC.wavedEventIds.has(lastEvent.id);
  if(lastEvent&&!waved){
    try{
      const{data:mine,error:werr}=await sb.from('waves').select('id').eq('sender_id',SOC.user.id).eq('event_id',lastEvent.id).maybeSingle();
      if(werr)console.error('[social] vérification coucou déjà envoyé a échoué :',werr);
      if(mine){waved=true;SOC.wavedEventIds.add(lastEvent.id);}
    }catch(e){console.error('[social] exception en vérifiant le coucou existant :',e);}
  }
  console.log('[social] bouton coucou pour',f.pseudo,'-> lastEvent:',lastEvent&&lastEvent.id,'| waved:',waved,'| bouton affiché:',!!lastEvent);
  const tousDebloques=(s&&s.all_badges)||[];
  const tendanceTxt={hausse:'En hausse',stable:'Stable',pause:'En pause'}[s&&s.tendance_volume]||'—';
  openSheet(f.pseudo,'',`
    ${s?`
    <div class="stats">
      <div class="stat"><b>${s.niveau}</b><span>Niveau</span></div>
      <div class="stat"><b>${(+s.xp).toLocaleString('fr-FR')}</b><span>XP</span></div>
      <div class="stat"><b>${s.last_session_duree}</b><span>min (dernière séance)</span></div>
    </div>
    <div class="mu" style="text-align:center;margin-top:10px;font-size:12.5px">Dernière séance : ${socFmtDate(s.last_session_at)}</div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><b>${s.serie_hebdo||0}</b><span>sem. d'affilée</span></div>
      <div class="stat"><b>${tendanceTxt}</b><span>Volume (4 sem.)</span></div>
    </div>
    ${(s.badges&&s.badges.length)?`<div class="sect">Badges récents</div><div class="bg">${s.badges.map(nom=>{
      const b=BADGES.find(x=>x.nom===nom);
      return `<div class="badge on"><span class="ic">${b?b.ic:'🏅'}</span><b>${esc(nom)}</b></div>`;
    }).join('')}</div>`:''}
    ${tousDebloques.length?`<div class="sect">Tous les badges — ${tousDebloques.length}/${BADGES.length}</div>
    <div class="bg">${BADGES.map(b=>`
      <div class="badge ${tousDebloques.includes(b.nom)?'on':'lock'}" onclick="toast('<b>${esc(b.nom)}</b><br>${esc(b.d)}')">
        <span class="ic">${b.ic}</span><b>${esc(b.nom)}</b>
      </div>`).join('')}</div>`:''}`
    :'<div class="empty">Cet ami n’a pas encore synchronisé de séance.</div>'}
    ${lastEvent?`<button class="btn sm ghost" style="margin-top:16px" ${waved?'disabled':''}
      onclick="socUiSendWaveFromProfile('${lastEvent.id}','${f.userId}',this)">${waved?'✅ Coucou envoyé':'👋 Dire coucou'}</button>`:''}
    <button class="btn sm ghost" style="margin-top:16px" onclick="socUiRemoveFromSheet('${f.relId}')">Retirer cet ami</button>
    <button class="btn sm ghost" onclick="closeSheet()">Fermer</button>`);
}
async function socUiSendWaveFromProfile(eventId,recipientId,btn){
  if(SOC.wavedEventIds.has(eventId))return;
  if(btn){btn.disabled=true;btn.textContent='✅ Coucou envoyé';}
  await socUiSendWave(eventId,recipientId); // met à jour SOC.wavedEventIds + le fil en arrière-plan
  if(!SOC.wavedEventIds.has(eventId)&&btn){btn.disabled=false;btn.textContent='👋 Dire coucou';} // échec : socUiSendWave a déjà averti par toast
}
async function socUiRemoveFromSheet(relId){
  if(!confirm('Retirer cet ami ?'))return;
  try{await socRemove(relId);closeSheet();renderAmis();}catch(e){toast(socFriendlyErr(e));}
}
