"""
双模态情感识别模块
结合语音和视频进行情感分析
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict
from enum import Enum

logger = logging.getLogger(__name__)


class EmotionType(Enum):
    """情感类型"""
    HAPPY = "happy"          # 开心
    SAD = "sad"              # 悲伤
    ANGRY = "angry"          # 愤怒
    SURPRISED = "surprised"  # 惊讶
    FEARFUL = "fearful"      # 恐惧
    DISGUSTED = "disgusted"  # 厌恶
    NEUTRAL = "neutral"      # 中性
    CONFUSED = "confused"    # 困惑
    EXCITED = "excited"      # 兴奋
    BORED = "bored"          # 无聊


@dataclass
class EmotionScore:
    """情感得分"""
    emotion: EmotionType
    confidence: float  # 0-1
    source: str  # "audio" or "visual"
    timestamp: datetime


@dataclass
class MultimodalEmotion:
    """多模态情感状态"""
    primary_emotion: EmotionType
    confidence: float
    audio_emotion: Optional[EmotionType] = None
    visual_emotion: Optional[EmotionType] = None
    audio_confidence: float = 0.0
    visual_confidence: float = 0.0
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


class EmotionAnalyzer:
    """情感分析器"""

    def __init__(self):
        self.emotion_history: List[MultimodalEmotion] = []
        self.max_history = 10  # 保留最近 10 次情感状态

        # 情感关键词映射
        self.emotion_keywords = {
            EmotionType.HAPPY: ["开心", "高兴", "快乐", "愉快", "笑", "微笑", "喜悦", "happy", "smile", "joy"],
            EmotionType.SAD: ["悲伤", "难过", "伤心", "哭", "沮丧", "失落", "sad", "cry", "upset"],
            EmotionType.ANGRY: ["生气", "愤怒", "恼火", "烦躁", "愤怒", "angry", "mad", "furious"],
            EmotionType.SURPRISED: ["惊讶", "吃惊", "震惊", "surprised", "shocked", "amazed"],
            EmotionType.FEARFUL: ["害怕", "恐惧", "担心", "焦虑", "fearful", "scared", "anxious"],
            EmotionType.CONFUSED: ["困惑", "疑惑", "不解", "迷茫", "confused", "puzzled"],
            EmotionType.EXCITED: ["兴奋", "激动", "excited", "thrilled"],
            EmotionType.BORED: ["无聊", "厌倦", "bored", "tired"],
            EmotionType.NEUTRAL: ["平静", "正常", "neutral", "calm"],
        }

    def analyze_audio_emotion(self, transcript: str, audio_features: Optional[Dict] = None) -> EmotionScore:
        """
        分析语音情感

        Args:
            transcript: 语音转文字内容
            audio_features: 音频特征（音量、语速等）
        """
        # 1. 基于文本内容的情感分析
        text_emotion = self._analyze_text_emotion(transcript)

        # 2. 基于音频特征的情感分析（如果有）
        if audio_features:
            audio_emotion = self._analyze_audio_features(audio_features)
            # 融合文本和音频特征
            emotion, confidence = self._fuse_emotions(
                [(text_emotion, 0.6), (audio_emotion, 0.4)]
            )
        else:
            emotion, confidence = text_emotion

        return EmotionScore(
            emotion=emotion,
            confidence=confidence,
            source="audio",
            timestamp=datetime.now()
        )

    def analyze_visual_emotion(self, visual_description: str) -> EmotionScore:
        """
        分析视觉情感

        Args:
            visual_description: Gemini 返回的视觉描述
        """
        emotion, confidence = self._analyze_text_emotion(visual_description)

        return EmotionScore(
            emotion=emotion,
            confidence=confidence,
            source="visual",
            timestamp=datetime.now()
        )

    def fuse_multimodal_emotions(
        self,
        audio_score: Optional[EmotionScore] = None,
        visual_score: Optional[EmotionScore] = None
    ) -> MultimodalEmotion:
        """
        融合多模态情感

        策略：
        - 如果两个模态情感一致，提高置信度
        - 如果不一致，根据置信度加权
        - 视觉情感权重略高（面部表情更直接）
        """
        if audio_score and visual_score:
            # 双模态融合
            if audio_score.emotion == visual_score.emotion:
                # 情感一致，提高置信度
                primary_emotion = audio_score.emotion
                confidence = min(
                    (audio_score.confidence + visual_score.confidence) / 1.5,
                    1.0
                )
            else:
                # 情感不一致，加权融合（视觉权重 0.6，语音权重 0.4）
                if visual_score.confidence * 0.6 > audio_score.confidence * 0.4:
                    primary_emotion = visual_score.emotion
                    confidence = visual_score.confidence * 0.6 + audio_score.confidence * 0.2
                else:
                    primary_emotion = audio_score.emotion
                    confidence = audio_score.confidence * 0.4 + visual_score.confidence * 0.3

            result = MultimodalEmotion(
                primary_emotion=primary_emotion,
                confidence=confidence,
                audio_emotion=audio_score.emotion,
                visual_emotion=visual_score.emotion,
                audio_confidence=audio_score.confidence,
                visual_confidence=visual_score.confidence
            )

        elif audio_score:
            # 仅语音模态
            result = MultimodalEmotion(
                primary_emotion=audio_score.emotion,
                confidence=audio_score.confidence * 0.8,  # 单模态降低置信度
                audio_emotion=audio_score.emotion,
                audio_confidence=audio_score.confidence
            )

        elif visual_score:
            # 仅视觉模态
            result = MultimodalEmotion(
                primary_emotion=visual_score.emotion,
                confidence=visual_score.confidence * 0.8,
                visual_emotion=visual_score.emotion,
                visual_confidence=visual_score.confidence
            )

        else:
            # 无输入，返回中性
            result = MultimodalEmotion(
                primary_emotion=EmotionType.NEUTRAL,
                confidence=0.5
            )

        # 保存到历史
        self.emotion_history.append(result)
        if len(self.emotion_history) > self.max_history:
            self.emotion_history.pop(0)

        return result

    def get_emotion_trend(self) -> Optional[EmotionType]:
        """获取情感趋势（最近的主要情感）"""
        if not self.emotion_history:
            return None

        # 统计最近 5 次情感
        recent = self.emotion_history[-5:]
        emotion_counts = {}

        for state in recent:
            emotion = state.primary_emotion
            emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1

        # 返回出现最多的情感
        return max(emotion_counts, key=emotion_counts.get)

    def generate_response_strategy(self, emotion: MultimodalEmotion) -> Dict:
        """
        根据情感生成回复策略

        Returns:
            包含回复建议的字典
        """
        strategies = {
            EmotionType.HAPPY: {
                "tone": "积极、热情",
                "suggestion": "保持轻松愉快的对话氛围",
                "prompt_addition": "用户情绪很好，请保持积极热情的语气回复。"
            },
            EmotionType.SAD: {
                "tone": "温和、关怀",
                "suggestion": "表达同理心，提供情感支持",
                "prompt_addition": "用户情绪低落，请用温和关怀的语气回复，表达同理心。"
            },
            EmotionType.ANGRY: {
                "tone": "冷静、理解",
                "suggestion": "保持冷静，避免激化情绪",
                "prompt_addition": "用户情绪激动，请保持冷静理解的态度，避免争论。"
            },
            EmotionType.CONFUSED: {
                "tone": "清晰、耐心",
                "suggestion": "提供清晰的解释和指导",
                "prompt_addition": "用户感到困惑，请用清晰简单的语言解释，保持耐心。"
            },
            EmotionType.EXCITED: {
                "tone": "热情、积极",
                "suggestion": "分享用户的兴奋感",
                "prompt_addition": "用户很兴奋，请用热情积极的语气回应。"
            },
            EmotionType.BORED: {
                "tone": "有趣、吸引",
                "suggestion": "尝试引入有趣的话题",
                "prompt_addition": "用户可能感到无聊，请尝试引入有趣的话题或改变对话方式。"
            },
            EmotionType.NEUTRAL: {
                "tone": "自然、友好",
                "suggestion": "保持正常对话节奏",
                "prompt_addition": "用户情绪平稳，请保持自然友好的对话。"
            }
        }

        return strategies.get(emotion.primary_emotion, strategies[EmotionType.NEUTRAL])

    def _analyze_text_emotion(self, text: str) -> tuple[EmotionType, float]:
        """基于文本内容分析情感"""
        text_lower = text.lower()

        # 统计各情感关键词出现次数
        emotion_scores = {}
        for emotion, keywords in self.emotion_keywords.items():
            score = sum(1 for keyword in keywords if keyword in text_lower)
            if score > 0:
                emotion_scores[emotion] = score

        if not emotion_scores:
            return EmotionType.NEUTRAL, 0.5

        # 返回得分最高的情感
        primary_emotion = max(emotion_scores, key=emotion_scores.get)
        max_score = emotion_scores[primary_emotion]

        # 计算置信度（简单归一化）
        confidence = min(max_score / 3.0, 1.0)

        return primary_emotion, confidence

    def _analyze_audio_features(self, features: Dict) -> tuple[EmotionType, float]:
        """基于音频特征分析情感"""
        # 这里可以根据音量、语速等特征判断情感
        # 简化实现：基于音量判断
        volume = features.get("volume", 0.5)

        if volume > 0.8:
            return EmotionType.EXCITED, 0.7
        elif volume < 0.2:
            return EmotionType.SAD, 0.6
        else:
            return EmotionType.NEUTRAL, 0.5

    def _fuse_emotions(self, emotions: List[tuple[tuple[EmotionType, float], float]]) -> tuple[EmotionType, float]:
        """融合多个情感判断"""
        weighted_scores = {}

        for (emotion, conf), weight in emotions:
            score = conf * weight
            weighted_scores[emotion] = weighted_scores.get(emotion, 0) + score

        primary_emotion = max(weighted_scores, key=weighted_scores.get)
        confidence = weighted_scores[primary_emotion]

        return primary_emotion, min(confidence, 1.0)


class EmotionAwarePromptBuilder:
    """情感感知的提示词构建器"""

    def __init__(self, analyzer: EmotionAnalyzer):
        self.analyzer = analyzer

    def build_system_prompt(self, base_prompt: str, emotion: MultimodalEmotion) -> str:
        """
        构建包含情感信息的系统提示词

        Args:
            base_prompt: 基础提示词
            emotion: 当前情感状态
        """
        strategy = self.analyzer.generate_response_strategy(emotion)

        emotion_context = f"""
[情感感知]
- 用户当前情感: {emotion.primary_emotion.value} (置信度: {emotion.confidence:.2f})
- 语音情感: {emotion.audio_emotion.value if emotion.audio_emotion else '无'}
- 视觉情感: {emotion.visual_emotion.value if emotion.visual_emotion else '无'}
- 回复策略: {strategy['prompt_addition']}
"""

        return f"{base_prompt}\n\n{emotion_context}"

    def build_visual_analysis_prompt(self) -> str:
        """构建视觉分析的提示词（专注于情感识别）"""
        return """请分析图片中人物的情感状态，包括：
1. 面部表情（微笑、皱眉、惊讶等）
2. 肢体语言（姿态、手势等）
3. 整体情绪（开心、悲伤、愤怒、困惑等）

请用一句话简要描述，重点关注情感信息。"""
