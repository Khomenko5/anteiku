import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

export default function AudioPlayer({ audioUrl }) {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [barWidth, setBarWidth] = useState(1);

  useEffect(() => {
    let isMounted = true;
    let currentSound = null;

    const loadAudio = async () => {
      try {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false, progressUpdateIntervalMillis: 100 }
        );

        currentSound = newSound;

        if (isMounted) {
          setSound(newSound);
          
          newSound.setOnPlaybackStatusUpdate((playbackStatus) => {
            if (!isMounted) return;
            
            if (playbackStatus.isLoaded) {
              setPosition(playbackStatus.positionMillis || 0);
              
              if (playbackStatus.durationMillis && playbackStatus.durationMillis > 0) {
                setDuration(playbackStatus.durationMillis);
              }
              
              setIsPlaying(playbackStatus.isPlaying);
              
              if (playbackStatus.didJustFinish) {
                setIsPlaying(false);
                newSound.setPositionAsync(0);
              }
            }
          });

          const status = await newSound.getStatusAsync();
          if (status.isLoaded && status.durationMillis) {
            setDuration(status.durationMillis);
          }
        }
      } catch (error) {
        console.error("Помилка завантаження аудіо:", error);
      }
    };

    loadAudio();

    return () => {
      isMounted = false;
      if (currentSound) {
        currentSound.unloadAsync();
      }
    };
  }, [audioUrl]);

  const togglePlayPause = async () => {
    if (!sound) return;
    if (isPlaying) {
      await sound.pauseAsync();
    } else {
      await sound.playAsync();
    }
  };

  const handleSeek = async (e) => {
    if (!sound || duration === 0 || barWidth <= 0) return;
    const clickX = Platform.OS === 'web' && e.nativeEvent.offsetX !== undefined ? e.nativeEvent.offsetX : e.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, clickX / barWidth));
    const seekTime = percentage * duration;
    await sound.setPositionAsync(seekTime);
  };

  const formatTime = (millis) => {
    if (!millis || isNaN(millis)) return "0:00";
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const progressPercentage = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <View style={styles.audioPlayerContainer}>
      <TouchableOpacity onPress={togglePlayPause} style={[styles.playPauseBtn, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={18} color="#FFF" />
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={1} style={styles.audioTrackContainer} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)} onPress={handleSeek}>
        <View style={[styles.audioTrackBg, { pointerEvents: 'none' }]} />
        <View style={[styles.audioProgress, { width: `${progressPercentage}%`, pointerEvents: 'none' }]} />
      </TouchableOpacity>
      <Text style={styles.audioTimeText}>{formatTime(position)} / {formatTime(duration)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  audioPlayerContainer: { flexDirection: 'row', alignItems: 'center', minWidth: 220, maxWidth: 280, marginTop: 4, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.15)', padding: 8, borderRadius: 16 },
  playPauseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#D97706', justifyContent: 'center', alignItems: 'center', marginRight: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  audioTrackContainer: { flex: 1, height: 20, justifyContent: 'center', position: 'relative', cursor: 'pointer' },
  audioTrackBg: { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3 },
  audioProgress: { position: 'absolute', left: 0, height: 6, backgroundColor: '#D97706', borderRadius: 3 },
  audioTimeText: { color: '#FFF', fontSize: 10, marginLeft: 10, fontWeight: 'bold', minWidth: 60, textAlign: 'right' },
});