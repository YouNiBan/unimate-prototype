import React, { useEffect, useState } from 'react';
import { AppState, View, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

/** No autoplay; release the player on unmount and pause when leaving a slide. */
export default function PostVideo({ uri, active, height, errorLabel }: {
  uri: string; active: boolean; height: number; errorLabel: string;
}) {
  const player = useVideoPlayer(uri);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  useEffect(() => {
    const status = player.addListener('statusChange', event => setFailed(event.status === 'error'));
    const app = AppState.addEventListener('change', state => { if (state !== 'active') player.pause(); });
    return () => { status.remove(); app.remove(); };
  }, [player]);
  return <View style={{ height, width: '100%', backgroundColor: '#0E1726', justifyContent: 'center' }}>
    {failed ? <Text accessibilityRole="alert" style={{ color: '#FFFFFF', textAlign: 'center', padding: 20 }}>{errorLabel}</Text>
      : <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', height }} />}
  </View>;
}
