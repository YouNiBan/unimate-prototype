import React from 'react';
import {Image,View} from 'react-native';

/** Dedicated artwork per theme: never recolour or invert the brand colours. */
export function BrandLogo({dark=false,width=150,height=75}:{dark?:boolean;width?:number;height?:number}) {
  return <Image source={dark?require('./assets/unimate-logo-dark.png'):require('./assets/unimate-logo.png')} accessibilityLabel="UniMate 优你伴" resizeMode="contain" style={{width,height}}/>;
}

/** The graduation cap and student head from the approved light logo. */
export function BrandMark({size=26,active=true}:{size?:number;active?:boolean}) {
  const scale=size/310;
  return <View accessible accessibilityRole="image" accessibilityLabel="UniMate" style={{width:size,height:size,overflow:'hidden',opacity:active?1:0.65}}><Image accessible={false} source={require('./assets/unimate-logo.png')} resizeMode="stretch" style={{position:'absolute',width:1792*scale,height:896*scale,left:-470*scale,top:(size-230*scale)/2-70*scale}}/></View>;
}
