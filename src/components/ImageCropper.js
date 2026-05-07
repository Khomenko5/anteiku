import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, PanResponder, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { COLORS } from '../theme/colors'; 
import { useToast } from '../context/ToastContext';

export default function ImageCropper({ imageUri, imageWidth, imageHeight, aspectRatio = 1, onCrop, onCancel }) {
  const SCREEN_WIDTH = Dimensions.get('window').width;

  const isAvatar = aspectRatio === 1;

  const MAX_WIDTH = isAvatar ? 300 : Math.min(600, SCREEN_WIDTH - 40);
  const CROP_WIDTH = Math.min(SCREEN_WIDTH - 40, MAX_WIDTH); 
  const CROP_HEIGHT = CROP_WIDTH / aspectRatio;

  const frameBorderRadius = isAvatar ? CROP_WIDTH / 2 : 12;

  const imageSize = { width: imageWidth, height: imageHeight };
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  
  const panState = useRef({ x: 0, y: 0 }).current;
  const { showToast } = useToast();

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        setPan({
          x: panState.x + gestureState.dx,
          y: panState.y + gestureState.dy
        });
      },
      onPanResponderRelease: (evt, gestureState) => {
        panState.x += gestureState.dx;
        panState.y += gestureState.dy;
        setPan({ x: panState.x, y: panState.y });
      }
    })
  ).current;

  const handleCrop = async () => {
    setIsProcessing(true);

    const baseScale = Math.max(CROP_WIDTH / imageSize.width, CROP_HEIGHT / imageSize.height);
    const currentScale = baseScale * zoom;

    const renderedWidth = imageSize.width * currentScale;
    const renderedHeight = imageSize.height * currentScale;

    let cropX = (renderedWidth / 2 - CROP_WIDTH / 2 - pan.x) / currentScale;
    let cropY = (renderedHeight / 2 - CROP_HEIGHT / 2 - pan.y) / currentScale;
    let cropW = CROP_WIDTH / currentScale;
    let cropH = CROP_HEIGHT / currentScale;

    cropX = Math.max(0, Math.min(cropX, imageSize.width - cropW));
    cropY = Math.max(0, Math.min(cropY, imageSize.height - cropH));

    try {
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      onCrop(result); 
    } catch (error) {
      showToast('error', 'Помилка обрізки', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const baseScale = Math.max(CROP_WIDTH / imageSize.width, CROP_HEIGHT / imageSize.height);
  const renderedWidth = imageSize.width * baseScale * zoom;
  const renderedHeight = imageSize.height * baseScale * zoom;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
          <Ionicons name="close" size={28} color={COLORS.text} />
        </TouchableOpacity>
        
        <Text style={styles.title}>
          Кадрування: <Text style={{ color: COLORS.primary }}>{isAvatar ? 'Аватар' : 'Банер'}</Text>
        </Text>
        
        <TouchableOpacity onPress={handleCrop} disabled={isProcessing} style={styles.headerBtn}>
          {isProcessing ? <ActivityIndicator color={COLORS.primary} /> : <Ionicons name="checkmark" size={28} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      <View style={styles.cropArea}>
        <View 
          style={[
            styles.cropFrame, 
            { width: CROP_WIDTH, height: CROP_HEIGHT, borderRadius: frameBorderRadius }
          ]} 
          {...panResponder.panHandlers}
        >
          <Image 
            source={{ uri: imageUri }} 
            style={{ 
              width: renderedWidth, 
              height: renderedHeight, 
              transform: [{ translateX: pan.x }, { translateY: pan.y }] 
            }}
          />
        </View>

        <View pointerEvents="none" style={[styles.cropOverlayBorder, { width: CROP_WIDTH, height: CROP_HEIGHT, borderRadius: frameBorderRadius }]} />
      </View>

      <View style={styles.controls}>
        <Text style={styles.hint}>Рухайте фото пальцем або мишкою</Text>
        <Text style={styles.zoomText}>Масштаб: {zoom.toFixed(1)}x</Text>
        <View style={styles.zoomButtons}>
          <TouchableOpacity style={styles.zBtn} onPress={() => setZoom(Math.max(1, zoom - 0.2))}>
            <Ionicons name="remove" size={24} color={COLORS.background}/>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zBtn} onPress={() => setZoom(Math.min(3, zoom + 0.2))}>
            <Ionicons name="add" size={24} color={COLORS.background}/>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.overlay, zIndex: 9999 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerBtn: { padding: 5 },
  title: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  
  cropArea: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', position: 'relative' },
  cropFrame: { overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' },
  cropOverlayBorder: { position: 'absolute', borderWidth: 2, borderColor: COLORS.primary, opacity: 0.8 },
  
  controls: { padding: 30, backgroundColor: COLORS.background, alignItems: 'center', paddingBottom: 50, borderTopWidth: 1, borderTopColor: COLORS.border },
  zoomText: { color: COLORS.textSecondary, marginBottom: 15, marginTop: 15, fontSize: 16, fontWeight: 'bold' },
  zoomButtons: { flexDirection: 'row', gap: 30 },
  zBtn: { backgroundColor: COLORS.primary, width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  hint: { color: COLORS.textMuted, fontSize: 14, marginBottom: 10, fontStyle: 'italic' }
});