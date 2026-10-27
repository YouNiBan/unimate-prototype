import React from 'react';
import {Image,View} from 'react-native';

/** Dedicated artwork per theme: dark artwork blends its black canvas into the surrounding surface. */
export function BrandLogo({dark=false,width=150,height=75}:{dark?:boolean;width?:number;height?:number}) {
  return <View style={{width,height,mixBlendMode:dark?'lighten':'normal'}}><Image source={dark?require('./assets/unimate-logo-dark.png'):require('./assets/unimate-logo.png')} accessibilityLabel="UniMate 优你伴" resizeMode="contain" style={{width,height}}/></View>;
}

/** Standalone square emblem, with its own safe padding for small navigation slots. */
export function BrandMark({size=26,active=true}:{size?:number;active?:boolean}) {
  return <Image accessibilityLabel="UniMate" source={require('./assets/unimate-emblem.png')} resizeMode="contain" style={{width:size,height:size,opacity:active?1:0.65}}/>;
}
