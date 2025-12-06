import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Text,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking, // <-- NEW: Imported to handle clickable links
} from "react-native";

// Data Source URLs
const JETTIES_URL = "https://stears-flourish-data.s3.amazonaws.com/jetties.json";
const ROUTES_URL = "https://stears-flourish-data.s3.amazonaws.com/routes.json";

// !! SECURITY WARNING: REMEMBER TO MOVE THIS KEY TO A SECURE BACKEND IN PRODUCTION !!
const GOOGLE_AI_API_KEY = "AIzaSyC7r9636kdQBlSlkKjFEy2TC2nDnjodip0"; 
// Updated to use the recommended gemini-2.5-flash model
const GOOGLE_AI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatComponentProps {
  onClose: () => void;
}

// --- START: MARKDOWN RENDERING UTILITIES ---

// Regex for finding bold text (e.g., **text**)
const BOLD_REGEX = /\*\*([^\*]+)\*\*/g;

// Regex for finding links (e.g., [text](url))
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

interface TextSegment {
    type: 'text' | 'bold' | 'link';
    content: string;
    url?: string;
}

/**
 * Parses the AI's raw text and breaks it down into segments for rendering.
 */
const parseMarkdown = (text: string): TextSegment[] => {
    let segments: TextSegment[] = [{ type: 'text', content: text }];
    
    // 1. Parse Links
    let newSegments: TextSegment[] = [];
    segments.forEach(seg => {
        if (seg.type !== 'text') {
            newSegments.push(seg);
            return;
        }

        let lastIndex = 0;
        let match;
        while ((match = LINK_REGEX.exec(seg.content)) !== null) {
            // Push plain text before the link
            if (match.index > lastIndex) {
                newSegments.push({ type: 'text', content: seg.content.substring(lastIndex, match.index) });
            }
            // Push the link segment
            newSegments.push({ type: 'link', content: match[1], url: match[2] });
            lastIndex = match.index + match[0].length;
        }
        // Push remaining plain text
        if (lastIndex < seg.content.length) {
            newSegments.push({ type: 'text', content: seg.content.substring(lastIndex) });
        }
    });
    segments = newSegments;
    
    // 2. Parse Bold
    newSegments = [];
    segments.forEach(seg => {
        if (seg.type !== 'text') {
            newSegments.push(seg);
            return;
        }

        let lastIndex = 0;
        let match;
        while ((match = BOLD_REGEX.exec(seg.content)) !== null) {
            // Push plain text before the bold
            if (match.index > lastIndex) {
                newSegments.push({ type: 'text', content: seg.content.substring(lastIndex, match.index) });
            }
            // Push the bold segment
            newSegments.push({ type: 'bold', content: match[1] });
            lastIndex = match.index + match[0].length;
        }
        // Push remaining plain text
        if (lastIndex < seg.content.length) {
            newSegments.push({ type: 'text', content: seg.content.substring(lastIndex) });
        }
    });
    
    return newSegments.filter(s => s.content.trim() !== '' || s.type !== 'text');
};


/**
 * React Native Component to render Markdown (Bold and Links)
 */
const MarkdownText = ({ text, style, aiTextStyle }: { text: string, style: any, aiTextStyle: any }) => {
    const segments = parseMarkdown(text);

    const handlePress = async (url: string) => {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
            await Linking.openURL(url);
        } else {
            console.error(`Don't know how to open this URL: ${url}`);
        }
    };

    return (
        <Text style={[style, aiTextStyle]}>
            {segments.map((segment, index) => {
                const key = `${segment.type}-${index}`;
                switch (segment.type) {
                    case 'bold':
                        return (
                            <Text key={key} style={styles.boldText}>
                                {segment.content}
                            </Text>
                        );
                    case 'link':
                        return (
                            <Text
                                key={key}
                                style={styles.linkText}
                                onPress={() => segment.url && handlePress(segment.url)}
                            >
                                {segment.content}
                            </Text>
                        );
                    case 'text':
                    default:
                        return <Text key={key}>{segment.content}</Text>;
                }
            })}
        </Text>
    );
};
// --- END: MARKDOWN RENDERING UTILITIES ---

/**
 * Extracts potential keywords (proper nouns, common ferry terms) from the user's text.
 */
const getKeywords = (text: string): string[] => {
    const textLower = text.toLowerCase();
    const words = textLower.split(/\s+/)
        .map(word => word.replace(/[^a-z0-9]/g, ''))
        .filter(word => word.length > 2);

    const specificTerms = [
        "ikorodu", "apapa", "badagry", "cms", "falomo", "lagos island", 
        "lekki", "victoria island", "eti-osa", "fare", "schedule", "route", 
        "jetty", "departure", "hour", "time", "ebute", "ero", "ibb" // Added more terms
    ];

    const foundKeywords = words.filter(word => specificTerms.includes(word) || isNaN(parseInt(word)));
    
    text.split(/\s+/)
        .filter(word => word.length > 1 && word[0] === word[0].toUpperCase())
        .forEach(word => foundKeywords.push(word.toLowerCase()));

    return Array.from(new Set(foundKeywords)).slice(0, 10);
};

/**
 * Filters the main ferry data to include only records relevant to the keywords.
 */
const filterDataByKeywords = (data: { jetties: any[], routes: any[] }, keywords: string[]) => {
    
    if (keywords.length === 0) {
        return {
            jetties: data.jetties.slice(0, 3),
            routes: data.routes.slice(0, 3),
            isSample: true,
        };
    }

    const filteredJetties = data.jetties.filter(jetty => 
        Object.values(jetty.properties).some(value => 
            typeof value === 'string' && keywords.some(kw => value.toLowerCase().includes(kw))
        )
    );

    const filteredRoutes = data.routes.filter(route => {
        if (Object.values(route.properties).some(value => 
            typeof value === 'string' && keywords.some(kw => value.toLowerCase().includes(kw))
        )) return true;

        const publicDetails = route.properties.operator?.Public;
        const privateDetails = route.properties.operator?.Private;

        if (publicDetails && Object.values(publicDetails).some(value => 
            typeof value === 'string' && keywords.some(kw => value.toLowerCase().includes(kw))
        )) return true;

        if (privateDetails && Object.values(privateDetails).some(value => 
            typeof value === 'string' && keywords.some(kw => value.toLowerCase().includes(kw))
        )) return true;

        return false;
    });

    const MAX_ITEMS = 15;
    return {
        jetties: filteredJetties.slice(0, MAX_ITEMS),
        routes: filteredRoutes.slice(0, MAX_ITEMS),
        isSample: false,
    };
};


export default function FerryChatComponent({ onClose }: ChatComponentProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      text: "👋 Hi! I'm your Lagos Ferry assistant. Ask me anything about ferry routes, jetties, schedules, fares, or how to get around Lagos by water!",
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [ferryData, setFerryData] = useState<{
    jetties: any[];
    routes: any[];
  } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Load ferry data on mount
  useEffect(() => {
    const loadFerryData = async () => {
      try {
        const [jettiesRes, routesRes] = await Promise.all([
          fetch(JETTIES_URL),
          fetch(ROUTES_URL),
        ]);
        const jettiesJson = await jettiesRes.json();
        const routesJson = await routesRes.json();

        setFerryData({
          jetties: jettiesJson.features,
          routes: routesJson.features,
        });
      } catch (err) {
        console.error("Error loading ferry data:", err);
      }
    };
    loadFerryData();
  }, []);

  const sendMessage = async () => {
    if (!inputText.trim() || loading || !ferryData) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setLoading(true);

    try {
      // 1. Get keywords from user input
      const keywords = getKeywords(inputText);
      
      // 2. Filter data to include only relevant jetties and routes
      const filteredData = filterDataByKeywords(ferryData, keywords);
      
      const dataLabel = filteredData.isSample 
          ? `(Sampled: Top 3 items, as no specific keywords were found)` 
          : `(Filtered: ${filteredData.jetties.length} Jetties, ${filteredData.routes.length} Routes relevant to "${keywords.join(', ')}")`;

      // 3. Create a smaller, targeted context
      const context = `You are a helpful assistant for the Lagos Ferry system in Nigeria. Answer the user's question accurately using ONLY the data provided below. Do not mention that the data is filtered.

--- FERRY DATA CONTEXT ${dataLabel} ---

JETTIES:
${JSON.stringify(filteredData.jetties, null, 2)}

ROUTES:
${JSON.stringify(filteredData.routes, null, 2)}

--- END OF DATA CONTEXT ---

Key information available: Jetty names, locations (LGA), status, ownership, quality, charter services, Route origins, destinations, stops, duration, fares, operators, operating hours, departure frequency, payment options, boat types.

When answering questions:
1. Be specific and helpful.
2. Reference actual jetty names and routes from the data, using **bold text** for the names (e.g., **Ebute Ero**).
3. Provide **fare information** when available.
4. Mention operating hours and schedules.
5. Suggest alternatives when relevant.
6. Keep responses concise but informative.
7. Use emojis to make responses friendly (⚓, 🚢, 💰, ⏰, etc.)
8. If you provide an external link, use the Markdown format: [Link Text](URL).

User question: ${inputText}`;

      const response = await fetch(GOOGLE_AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: context,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      });

      const data = await response.json();
      
      // --- START: UPDATED ERROR CHECKING ---
      
      if (data.error) {
        console.error("Gemini API Error:", data.error);
        const errorMessage = data.error.message || "An unknown API error occurred.";
        throw new Error(`Gemini API Error: ${errorMessage}`);
      }

      const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (aiResponseText) {
        // IMPORTANT: The AI response text may now contain markdown
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: aiResponseText,
          isUser: false,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
      } 
      
      else if (data.candidates?.[0]?.finishReason === "SAFETY") {
          throw new Error("AI response was blocked due to safety settings.");
      } else {
        console.warn("Unexpected API Response Structure:", data);
        const finishReason = data.candidates?.[0]?.finishReason;
        throw new Error(`Invalid or incomplete response from AI. Finish Reason: ${finishReason || 'Unknown'}.`);
      }

    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Sorry, I can't answer right now. Error: ${error.message || "Unknown error."} 🙏`,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // --- START: RENDER MODIFICATIONS ---
  const renderMessageText = (message: Message) => {
    if (message.isUser) {
        // User messages are plain text
        return (
            <Text 
                style={[
                    styles.messageText, 
                    styles.userText
                ]}
            >
                {message.text}
            </Text>
        );
    } else {
        // AI messages use the new MarkdownText component
        return (
            <MarkdownText 
                text={message.text} 
                style={styles.messageText} 
                aiTextStyle={styles.aiText} 
            />
        );
    }
  };
  // --- END: RENDER MODIFICATIONS ---

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Header (styles remain the same) */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>🚢 Ferry Assistant</Text>
          <Text style={styles.headerSubtitle}>Ask about routes & schedules</Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.isUser ? styles.userBubble : styles.aiBubble,
            ]}
          >
            {/* Renders the text using the new function */}
            {renderMessageText(message)}
            
            <Text
              style={[
                styles.timestamp,
                message.isUser ? styles.userTimestamp : styles.aiTimestamp,
              ]}
            >
              {message.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        ))}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#0EA5E9" />
            <Text style={styles.loadingText}>Thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input Area (styles remain the same) */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask about routes, fares, schedules..."
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={500}
          onSubmitEditing={sendMessage}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || loading}
        >
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0EA5E9",
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 18,
    color: "#64748B",
    fontWeight: "600",
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#0EA5E9",
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "white",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: "white",
  },
  aiText: {
    color: "#1E293B",
  },
  // --- NEW STYLES FOR MARKDOWN ---
  boldText: {
    fontWeight: 'bold',
  },
  linkText: {
    color: '#0EA5E9', // Primary blue color for links
    textDecorationLine: 'underline',
  },
  // --- END NEW STYLES ---
  timestamp: {
    fontSize: 11,
    marginTop: 6,
  },
  userTimestamp: {
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "right",
  },
  aiTimestamp: {
    color: "#94A3B8",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#64748B",
    fontStyle: "italic",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  input: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1E293B",
    maxHeight: 100,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0EA5E9",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0EA5E9",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: "#CBD5E1",
    shadowOpacity: 0,
  },
  sendButtonText: {
    fontSize: 20,
    color: "white",
    fontWeight: "bold",
  },
});