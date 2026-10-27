import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import workspaceHtml from './src/generated/workspace';
import { decodeExportContent } from './src/export-bytes';

const BASE_URL='https://bc-design.local/';
function safeJson(value:unknown){return JSON.stringify(value).replace(/</g,'\\u003c');}
function isExternalLink(url:string){return /^https?:\/\//i.test(url)&&!url.startsWith(BASE_URL);}

export default function App(){
  const [html,setHtml]=useState<string|null>(null),[error,setError]=useState('');
  const saveFile=useMemo(()=>new File(Paths.document,'bc-design-project.json'),[]);
  const saves=useRef<Promise<void>>(Promise.resolve());
  const webView=useRef<WebView<unknown>>(null);
  useEffect(()=>{
    let mounted=true;
    const load=async()=>{
      try{
        const saved=saveFile.exists?await saveFile.text():null;
        if(saved)JSON.parse(saved);
        if(mounted)setHtml(workspaceHtml.replace('/*__BC_INITIAL_MODEL__*/null',safeJson(saved)));
      }catch{if(mounted)setError('The saved project could not be opened. Keep your JSON backup and restart the app.');}
    };
    void load();return()=>{mounted=false;};
  },[saveFile]);
  const source=useMemo(()=>html?{html,baseUrl:BASE_URL}:undefined,[html]);
  const receive=useCallback((event:WebViewMessageEvent)=>{
    try{
      const message=JSON.parse(event.nativeEvent.data);
      if(message.type==='autosave'&&typeof message.content==='string'){
        JSON.parse(message.content);
        const content=message.content;
        saves.current=saves.current.then(()=>{if(!saveFile.exists)saveFile.create();saveFile.write(content);webView.current?.injectJavaScript("document.querySelector('#saveStatus').textContent='Saved on device';document.querySelector('#saveDot').classList.remove('is-saving');true;");}).catch(()=>setError('Device autosave failed. Use Save JSON to keep a project backup.'));
      }else if(message.type==='export'&&typeof message.content==='string'&&typeof message.name==='string'){
        const exportFile=async()=>{
          try{
            if(!await Sharing.isAvailableAsync()){setError('File sharing is unavailable on this device.');return;}
            const name=message.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120)||'bc-design-export.json';
            const content=decodeExportContent(message);
            const file=new File(Paths.cache,Date.now()+'-'+name);file.create();file.write(content);
            await Sharing.shareAsync(file.uri,{mimeType:typeof message.mime==='string'?message.mime:'application/octet-stream',dialogTitle:'Save or share BC Design export'});
          }catch{setError('The export could not be saved. Please try exporting again.');}
        };
        void exportFile();
      }
    }catch{setError('The workspace returned an invalid save or export message.');}
  },[saveFile]);
  const openExternal=useCallback((url:string)=>{if(isExternalLink(url))void Linking.openURL(url).catch(()=>setError('This product/source link could not be opened.'));},[]);
  return <SafeAreaProvider><SafeAreaView style={styles.container} edges={['top','bottom']}>
    <StatusBar style="light"/>
    {error?<Text style={styles.error} accessibilityRole="alert">{error}</Text>:null}
    {source?<WebView<unknown> ref={webView} style={styles.workspace} source={source} originWhitelist={['*']} javaScriptEnabled domStorageEnabled onMessage={receive}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={request=>{if(request.url==='about:blank'||request.url.startsWith(BASE_URL))return true;openExternal(request.url);return false;}}
      onOpenWindow={event=>openExternal(event.nativeEvent.targetUrl)}
      onError={()=>setError('The drawing workspace could not open. Restart the app and try again.')}
    />:<View style={styles.loading}><Text style={styles.loadingText}>{error?'Project loading stopped':'Opening BC Design…'}</Text></View>}
  </SafeAreaView></SafeAreaProvider>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#1c6243'},workspace:{flex:1,backgroundColor:'#fbfcfb'},loading:{flex:1,alignItems:'center',justifyContent:'center'},loadingText:{color:'#ffffff'},error:{padding:10,color:'#ffffff',backgroundColor:'#a5242d'}});
