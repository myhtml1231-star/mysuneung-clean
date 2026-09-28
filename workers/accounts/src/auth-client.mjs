import {initializeApp,getApps} from 'firebase/app';
import {getAuth,setPersistence,inMemoryPersistence,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,reload,signOut} from 'firebase/auth';
import {mountAuthFlow} from './auth-flow.mjs';
let auth;
const wrap=user=>({email:user.email,verified:user.emailVerified===true,user,getToken:()=>user.getIdToken(true)});
const continueSettings=()=>({url:location.origin+'/auth?verified=1',handleCodeInApp:false});
mountAuthFlow({
 account:window.MSNAccount,
 async loadConfig(){const r=await fetch('/api/account/config',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('로그인 연결을 다시 확인해 주세요.');return r.json();},
 async initialize(config){auth=getAuth(getApps()[0]||initializeApp(config));auth.languageCode='ko';await setPersistence(auth,inMemoryPersistence);},
 async popup(){const p=new GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});return wrap((await signInWithPopup(auth,p)).user);},
 async loginEmail(email,password){return wrap((await signInWithEmailAndPassword(auth,email,password)).user);},
 async registerEmail(email,password){return wrap((await createUserWithEmailAndPassword(auth,email,password)).user);},
 async sendVerification(identity){await sendEmailVerification(identity.user,continueSettings());},
 async refreshIdentity(identity){await reload(identity.user);return wrap(identity.user);},
 async resetPassword(email){await sendPasswordResetEmail(auth,email,{url:location.origin+'/auth',handleCodeInApp:false});},
 clearIdentity:()=>auth?signOut(auth):Promise.resolve(),
 async submitSession(body,csrf){const r=await fetch('/api/account/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-MSN-Login-CSRF':csrf},body:JSON.stringify(body)});const d=await r.json();return {...d,ok:r.ok&&d.ok===true};},
 navigate:url=>location.replace(url),
 notifyTabs(){try{const c=new BroadcastChannel('mysuneung-account-events');c.postMessage({type:'auth-changed'});c.close();}catch{}}
});
