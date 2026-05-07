import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AudioPlayer from './AudioPlayer';
import { COLORS } from '../theme/colors';

const ChatImageWrapper = ({ uri, onPress }) => {
  const [aspectRatio, setAspectRatio] = useState(null);
  useEffect(() => {
    if (uri) Image.getSize(uri, (w, h) => { if (w > 0 && h > 0) setAspectRatio(w / h); }, () => setAspectRatio(1));
  }, [uri]);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={{ marginTop: 4, marginBottom: 4 }}>
      {aspectRatio ? <Image source={{ uri }} style={{ width: 240, aspectRatio: aspectRatio, borderRadius: 12 }} resizeMode="cover" /> : <View style={{ width: 240, height: 240, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="small" color={COLORS.primary} /></View>}
    </TouchableOpacity>
  );
};

export default function MessageItem({
  item,
  isMe,
  isLeader = false,
  showTail,
  reactingToMsgId,
  setReactingToMsgId,
  onReact,
  onPress,
  onReply,
  onEdit,
  onDelete,
  onOpenImageViewer,
  navigation,
  getUserAvatar,
  currentUserId
}) {
  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  };

  const groupedReactions = item.reactions ? item.reactions.reduce((acc, curr) => {
    if (!acc[curr.emoji]) acc[curr.emoji] = [];
    acc[curr.emoji].push(curr.userId);
    return acc;
  }, {}) : {};

  const renderReplyBlock = () => {
    if (!item.replyTo) return null;
    return (
      <View style={styles.messageReplyContainer}>
        <View style={[styles.messageReplyLine, { backgroundColor: isMe ? COLORS.text : COLORS.primary }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.messageReplyName, { color: isMe ? COLORS.text : COLORS.primary }]}>{item.replyTo.senderName}</Text>
          <Text style={styles.messageReplyText} numberOfLines={1}>{item.replyTo.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[
      styles.messageWrapper, 
      isMe ? styles.messageWrapperMine : styles.messageWrapperTheirs, 
      showTail && (isMe ? styles.messageWrapperMineTail : styles.messageWrapperTheirsTail)
    ]}>
      {reactingToMsgId === item.id && (
        <View style={[styles.reactionPickerBubble, isMe ? { right: 15 } : { left: 15 }]}>
          {['👍','❤️','😂','🔥','😢'].map(emoji => (
            <TouchableOpacity key={emoji} onPress={() => onReact(item.id, emoji, item.reactions)} style={styles.reactionBtn}>
              <Text style={{fontSize: 22}}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity 
        activeOpacity={1} 
        onPress={() => onPress(item)}
        style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage, showTail && (isMe ? styles.myMessageTail : styles.theirMessageTail)]}
      >
        {showTail && <View style={[styles.messageTail, isMe ? styles.messageTailMine : styles.messageTailTheirs]} />}
        
        {!isMe && item.senderName && <Text style={styles.chatSenderName}>{item.senderName}</Text>}
        
        {renderReplyBlock()}

        {item.sharedPost && (
          <TouchableOpacity 
            activeOpacity={0.85} 
            style={[styles.sharedPostCard, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}
            onPress={() => navigation.navigate('Profile', { identifier: item.sharedPost.authorId, highlightPostId: item.sharedPost.id })}
          >
            <View style={styles.sharedPostHeader}>
              {item.sharedPost.authorAvatarUrl ? (
                <Image source={{ uri: item.sharedPost.authorAvatarUrl }} style={styles.sharedPostAvatar} resizeMode="cover" />
              ) : (
                <View style={styles.sharedPostAvatarPlaceholder}>
                  <Text style={styles.sharedPostAvatarText}>{item.sharedPost.authorName[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.sharedPostName}>{item.sharedPost.authorName}</Text>
                <Text style={styles.sharedPostSubText}>Пересланий запис</Text>
              </View>
            </View>
            {item.sharedPost.text ? <Text style={styles.sharedPostText} numberOfLines={4}>{item.sharedPost.text}</Text> : null}
            {item.sharedPost.imageUrl ? <Image source={{ uri: item.sharedPost.imageUrl }} style={styles.sharedPostImage} resizeMode="cover" /> : null}
          </TouchableOpacity>
        )}

        {item.imageUrl && <ChatImageWrapper uri={item.imageUrl} onPress={() => onOpenImageViewer(item.imageUrl)} />}
        {item.fileUrl && (
          <TouchableOpacity style={styles.fileContainer} onPress={() => Platform.OS === 'web' ? window.open(item.fileUrl, '_blank') : null}>
            <Ionicons name="document-text" size={24} color={isMe ? COLORS.text : COLORS.primary} />
            <Text style={[styles.fileName, {color: isMe ? COLORS.text : COLORS.textSecondary}]} numberOfLines={1}>{item.fileName}</Text>
          </TouchableOpacity>
        )}

        {item.text ? <Text style={[styles.messageText, isMe && {color: COLORS.text}]}>{item.text}</Text> : null}
        {item.audioUrl && <AudioPlayer audioUrl={item.audioUrl} />}
        
        {Object.keys(groupedReactions).length > 0 && (
          <View style={styles.reactionsDisplayRow}>
            {Object.entries(groupedReactions).map(([emoji, userIds]) => (
              <TouchableOpacity 
                key={emoji} 
                style={[styles.reactionBadge, userIds.includes(currentUserId) && styles.reactionBadgeActive]}
                onPress={() => onReact(item.id, emoji, item.reactions)}
              >
                <Text style={styles.reactionBadgeText}>{emoji}</Text>
                <View style={styles.reactionAvatarsRow}>
                  {userIds.slice(0, 3).map((uid, idx) => {
                    const avatar = getUserAvatar(uid);
                    return avatar ? (
                      <Image key={uid} source={{ uri: avatar }} style={[styles.reactionMiniAvatar, { marginLeft: idx > 0 ? -6 : 4 }]} />
                    ) : (
                      <View key={uid} style={[styles.reactionMiniAvatarPlaceholder, { marginLeft: idx > 0 ? -6 : 4 }]} />
                    );
                  })}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.messageFooterInfo}>
          {item.isEdited && <Text style={styles.editedText}>(ред.) </Text>}
          <Text style={styles.messageTime}>{formatMessageTime(item.createdAt)}</Text>
          
          {isMe && item.hasOwnProperty('isRead') && (
            <Ionicons name={item.isRead ? "checkmark-done-outline" : "checkmark-outline"} size={16} color={item.isRead ? COLORS.success : "rgba(255,255,255,0.6)"} style={{ marginLeft: 4, marginRight: 6 }} />
          )}

          <TouchableOpacity onPress={() => setReactingToMsgId(reactingToMsgId === item.id ? null : item.id)} style={styles.actionIconBtn}>
            <Ionicons name="add-circle-outline" size={14} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onReply(item)} style={styles.actionIconBtn}>
            <Ionicons name="arrow-undo-outline" size={14} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          {isMe && !item.audioUrl && (
            <TouchableOpacity onPress={() => onEdit(item)} style={styles.actionIconBtn}>
              <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
          {(isMe || isLeader) && (
            <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.actionIconBtn}>
              <Ionicons name="trash-outline" size={14} color={isMe ? "rgba(255,255,255,0.6)" : "rgba(239, 68, 68, 0.7)"} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  messageWrapper: { width: '100%', marginBottom: 6, position: 'relative' },
  messageWrapperMine: { alignItems: 'flex-end', paddingRight: 10 },
  messageWrapperTheirs: { alignItems: 'flex-start', paddingLeft: 10 },
  messageWrapperMineTail: { marginBottom: 15 },
  messageWrapperTheirsTail: { marginBottom: 15 },
  messageBubble: { maxWidth: '75%', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, position: 'relative' },
  myMessage: { backgroundColor: '#8B5E34' },
  theirMessage: { backgroundColor: COLORS.surfaceLight },
  myMessageTail: { borderBottomRightRadius: 4 },
  theirMessageTail: { borderBottomLeftRadius: 4 },
  messageTail: { position: 'absolute', bottom: 0, width: 0, height: 0, borderTopWidth: 15, borderTopColor: 'transparent' },
  messageTailMine: { right: -8, borderLeftWidth: 15, borderLeftColor: '#8B5E34' },
  messageTailTheirs: { left: -8, borderRightWidth: 15, borderRightColor: COLORS.surfaceLight },
  chatSenderName: { color: 'rgba(213, 196, 176, 0.4)', fontSize: 12, marginBottom: 4, fontWeight: 'bold' },
  messageText: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  messageFooterInfo: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  messageTime: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 10 },
  editedText: { color: 'rgba(255, 255, 255, 0.5)', fontSize: 10, fontStyle: 'italic' },
  actionIconBtn: { marginLeft: 8, padding: 2, outlineStyle: 'none' },
  messageReplyContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6, marginBottom: 8, overflow: 'hidden' },
  messageReplyLine: { width: 3, borderRadius: 2, marginRight: 8 },
  messageReplyName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  messageReplyText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  sharedPostCard: { backgroundColor: 'rgba(0,0,0,0.25)', padding: 12, borderRadius: 16, borderLeftWidth: 4, borderLeftColor: COLORS.primary, minWidth: 260, maxWidth: '100%', marginBottom: 8, marginTop: 4 },
  sharedPostHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sharedPostAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  sharedPostAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, marginRight: 10, backgroundColor: 'rgba(213, 196, 176, 0.1)', justifyContent: 'center', alignItems: 'center' },
  sharedPostAvatarText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: 'bold' },
  sharedPostName: { color: COLORS.text, fontWeight: 'bold', fontSize: 14 },
  sharedPostSubText: { color: COLORS.textMuted, fontSize: 11, fontStyle: 'italic' },
  sharedPostText: { color: COLORS.text, fontSize: 14, marginBottom: 10, lineHeight: 20 },
  sharedPostImage: { width: '100%', height: 200, borderRadius: 8 },
  fileContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8, marginTop: 5, marginBottom: 5 },
  fileName: { fontSize: 14, marginLeft: 8, textDecorationLine: 'underline', flexShrink: 1 },
  reactionPickerBubble: { position: 'absolute', bottom: '100%', flexDirection: 'row', backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginBottom: 5, borderWidth: 1, borderColor: COLORS.border, elevation: 15, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, zIndex: 1000 },
  reactionBtn: { paddingHorizontal: 6 },
  reactionsDisplayRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  reactionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, paddingLeft: 6, paddingRight: 4, paddingVertical: 2, marginRight: 4, marginTop: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  reactionBadgeActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  reactionBadgeText: { fontSize: 12, color: COLORS.text },
  reactionAvatarsRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  reactionMiniAvatar: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: COLORS.surface },
  reactionMiniAvatarPlaceholder: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: COLORS.surface, backgroundColor: COLORS.primary },
});