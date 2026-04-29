import React from 'react';
import { Modal, TouchableOpacity, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ImageViewerModal({ visible, imageUri, onClose }) {
  if (!visible || !imageUri) return null;

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity 
        style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center' }} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <TouchableOpacity 
          style={[{ position: 'absolute', top: Platform.OS === 'web' ? 20 : 50, right: 20, zIndex: 100, padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
          onPress={onClose}
        >
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
        
        <Image source={{ uri: imageUri }} style={{ width: '90%', height: '90%', borderRadius: 16 }} resizeMode="contain" />
      </TouchableOpacity>
    </Modal>
  );
}