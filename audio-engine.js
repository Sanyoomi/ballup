/* Progressive polyphony: larger balls laugh longer and sound deeper. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MemeAudio=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  class SoundEngine {
    constructor(options={}){
      this.assets=options.assets||{};this.enabled=options.enabled!==false;this.onUnavailable=options.onUnavailable||(()=>{});
      this.context=null;this.master=null;this.buffer=null;this.loading=null;
      this.sources=new Set();this.laughVoices=new Set();this.normalization=.6;this.sampleOffset=0;this.unavailableReported=false;this.generation=0;
    }
    setEnabled(value){this.enabled=Boolean(value);if(!this.enabled)this.stopAll();}
    preload(){
      if(this.loading||this.buffer)return;
      const Decoder=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
      if(!Decoder)return;
      try{
        this.loading=this.loadSample(new Decoder(2,1,44100));
        this.loading.catch(()=>{this.loading=null;});
      }catch{this.loading=null;}
    }
    async unlock(){
      if(!this.enabled)return false;
      try{
        const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!Audio)throw new Error('AudioContext unavailable');
        if(!this.context){
          this.context=new Audio();
          this.master=this.context.createGain();this.master.gain.value=.48;
          const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-14;compressor.knee.value=18;compressor.ratio.value=8;compressor.attack.value=.003;compressor.release.value=.16;
          const limiter=this.context.createWaveShaper(),curve=new Float32Array(2049);
          for(let i=0;i<curve.length;i++)curve[i]=.94*Math.tanh((i/(curve.length-1)*2-1)*1.6)/Math.tanh(1.6);
          limiter.curve=curve;limiter.oversample='2x';
          this.master.connect(compressor);compressor.connect(limiter);limiter.connect(this.context.destination);
        }
        if(this.context.state!=='running')await this.context.resume();
        if(!this.loading)this.loading=this.loadSample();
        await this.loading;return this.context.state==='running';
      }catch{
        if(!this.unavailableReported){this.unavailableReported=true;this.onUnavailable();}
        return Boolean(this.context&&this.context.state==='running');
      }
    }
    async loadSample(decoder=this.context){
      const sample=this.assets.laugh;if(!sample||!sample.base64)throw new Error('Missing laughter sample');
      const bytes=Uint8Array.from(globalThis.atob(sample.base64),c=>c.charCodeAt(0));
      const buffer=await decoder.decodeAudioData(bytes.buffer);
      if(!Number.isFinite(buffer.duration)||buffer.duration<.15)throw new Error('Invalid laughter sample');
      let peak=0;
      for(let channel=0;channel<buffer.numberOfChannels;channel++){
        const values=buffer.getChannelData(channel);
        for(let i=0;i<values.length;i++){
          const value=Math.abs(values[i]);if(value>peak)peak=value;
        }
      }
      if(peak<.002)throw new Error('Silent laughter sample');
      this.normalization=Math.min(1.5,.8/peak);
      // Skip quiet lead-in so the audible laugh begins with the merge animation.
      const windowSize=Math.max(1,Math.round(buffer.sampleRate*.01)),threshold=Math.max(.008,peak*.025);
      let firstAudible=buffer.duration;
      for(let channel=0;channel<buffer.numberOfChannels;channel++){
        const values=buffer.getChannelData(channel);let consecutive=0;
        for(let start=0;start<values.length;start+=windowSize){
          const end=Math.min(start+windowSize,values.length);let energy=0;
          for(let i=start;i<end;i++)energy+=values[i]*values[i];
          consecutive=Math.sqrt(energy/(end-start))>=threshold?consecutive+1:0;
          if(consecutive>=2){firstAudible=Math.min(firstAudible,Math.max(0,start-windowSize)/buffer.sampleRate);break;}
        }
      }
      this.sampleOffset=firstAudible<buffer.duration?Math.max(0,firstAudible-.008):0;
      this.buffer=buffer;
    }
    stopAll(){
      this.generation++;
      for(const source of this.sources){try{source.stop();}catch{}}
      this.sources.clear();this.laughVoices.clear();this.updateMixLevel();
    }
    updateMixLevel(){
      if(!this.master)return;
      const now=this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(.48/Math.sqrt(Math.max(1,this.laughVoices.size)),now,.035);
    }
    // Ten fixed pitches, from +7 to -7 semitones. Combo count does not change pitch.
    playbackRateForLevel(level=0){
      const value=Number.isFinite(level)?Math.max(0,Math.min(9,level)):0;
      return Math.pow(2,(7-value*14/9)/12);
    }
    durationForLevel(level=0){
      const value=Number.isFinite(level)?Math.max(0,Math.min(9,level)):0;
      return 1.5+value*.5;
    }
    merge(level=1){return this.playLaugh(level);}
    preview(level=0){return this.playLaugh(level);}
    async playLaugh(level=1){
      if(!this.enabled)return;
      if(this.buffer&&this.context?.state==='running'){
        this.playLaughNow(level);return;
      }
      const generation=this.generation;
      if(!await this.unlock()||!this.enabled||this.generation!==generation)return;
      this.playLaughNow(level);
    }
    playLaughNow(level){
      if(!this.enabled||!this.context)return;
      if(!this.buffer){this.boing(level);return;}
      const now=this.context.currentTime;
      const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.buffer;
      const rate=this.playbackRateForLevel(level);
      // Scale sampled content by rate to keep each level's intended audible duration.
      const sampleDuration=Math.min(this.durationForLevel(level)*rate,this.buffer.duration-this.sampleOffset),wallDuration=sampleDuration/rate;
      source.playbackRate.value=rate;gain.gain.setValueAtTime(0,now);
      gain.gain.linearRampToValueAtTime(this.normalization,now+.003);
      gain.gain.setValueAtTime(this.normalization,now+Math.max(.013,wallDuration-.055));
      gain.gain.linearRampToValueAtTime(0,now+wallDuration);
      source.connect(gain);gain.connect(this.master);this.sources.add(source);this.laughVoices.add(source);this.updateMixLevel();
      source.onended=()=>{this.sources.delete(source);this.laughVoices.delete(source);source.disconnect();gain.disconnect();this.updateMixLevel();};
      source.start(now,this.sampleOffset,sampleDuration);
    }
    drop(){if(this.enabled&&this.context?.state==='running')this.boing(0,true);}
    boing(level,drop=false){
      const now=this.context.currentTime,osc=this.context.createOscillator(),gain=this.context.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(drop?240:330+level*24,now);osc.frequency.exponentialRampToValueAtTime(drop?140:180,now+.085);
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(drop?.07:.16,now+.005);gain.gain.exponentialRampToValueAtTime(.001,now+.105);
      osc.connect(gain);gain.connect(this.master);this.sources.add(osc);osc.onended=()=>{this.sources.delete(osc);osc.disconnect();gain.disconnect();};osc.start(now);osc.stop(now+.12);
    }
  }
  return {SoundEngine};
});
