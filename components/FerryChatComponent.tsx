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
  Linking,
  Alert,
} from "react-native";
import * as Location from "expo-location";

// Data Source URLs
const JETTIES_URL = "https://stears-flourish-data.s3.amazonaws.com/jetties.json";
const ROUTES_URL = "https://stears-flourish-data.s3.amazonaws.com/routes.json";

// !! SECURITY WARNING: REMEMBER TO MOVE THIS KEY TO A SECURE BACKEND IN PRODUCTION !!
const GOOGLE_AI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GOOGLE_AI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  isSystemMessage?: boolean;
}

interface ChatComponentProps {
  onClose: () => void;
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

// --- UTILITY FUNCTIONS ---

const BOLD_REGEX = /\*\*([^\*]+)\*\*/g;
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

interface TextSegment {
  type: 'text' | 'bold' | 'link';
  content: string;
  url?: string;
}

const parseMarkdown = (text: string): TextSegment[] => {
  let segments: TextSegment[] = [{ type: 'text', content: text }];
  
  // Parse Links
  let newSegments: TextSegment[] = [];
  segments.forEach(seg => {
    if (seg.type !== 'text') {
      newSegments.push(seg);
      return;
    }

    let lastIndex = 0;
    let match;
    const linkRegex = new RegExp(LINK_REGEX.source, 'g');
    while ((match = linkRegex.exec(seg.content)) !== null) {
      if (match.index > lastIndex) {
        newSegments.push({ type: 'text', content: seg.content.substring(lastIndex, match.index) });
      }
      newSegments.push({ type: 'link', content: match[1], url: match[2] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < seg.content.length) {
      newSegments.push({ type: 'text', content: seg.content.substring(lastIndex) });
    }
  });
  segments = newSegments;
  
  // Parse Bold
  newSegments = [];
  segments.forEach(seg => {
    if (seg.type !== 'text') {
      newSegments.push(seg);
      return;
    }

    let lastIndex = 0;
    let match;
    const boldRegex = new RegExp(BOLD_REGEX.source, 'g');
    while ((match = boldRegex.exec(seg.content)) !== null) {
      if (match.index > lastIndex) {
        newSegments.push({ type: 'text', content: seg.content.substring(lastIndex, match.index) });
      }
      newSegments.push({ type: 'bold', content: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < seg.content.length) {
      newSegments.push({ type: 'text', content: seg.content.substring(lastIndex) });
    }
  });
  
  return newSegments.filter(s => s.content.trim() !== '' || s.type !== 'text');
};

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

// Calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Find nearest jetties to user location
const findNearestJetties = (userLocation: UserLocation, jetties: any[], count: number = 3) => {
  const jettiesWithDistance = jetties.map(jetty => {
    const jettyLat = jetty.geometry.coordinates[1];
    const jettyLon = jetty.geometry.coordinates[0];
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      jettyLat,
      jettyLon
    );
    return { ...jetty, distance };
  });

  return jettiesWithDistance
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
};

const getKeywords = (text: string): string[] => {
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/)
    .map(word => word.replace(/[^a-z0-9]/g, ''))
    .filter(word => word.length > 2);

  const specificTerms = [
    "ikorodu", "apapa", "badagry", "cms", "falomo", "lagos island", 
    "lekki", "victoria island", "eti-osa", "fare", "schedule", "route", 
    "jetty", "departure", "hour", "time", "ebute", "ero", "ibb", "nearest", "near", "close", "closest"
  ];

  const foundKeywords = words.filter(word => specificTerms.includes(word) || isNaN(parseInt(word)));
  
  text.split(/\s+/)
    .filter(word => word.length > 1 && word[0] === word[0].toUpperCase())
    .forEach(word => foundKeywords.push(word.toLowerCase()));

  return Array.from(new Set(foundKeywords)).slice(0, 10);
};

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

  const MAX_ITEMS = 8;
  return {
    jetties: filteredJetties.slice(0, MAX_ITEMS),
    routes: filteredRoutes.slice(0, MAX_ITEMS),
    isSample: false,
  };
};

// Check if query is asking for nearest jetty
const isNearestJettyQuery = (text: string): boolean => {
  const textLower = text.toLowerCase();
  const nearbyKeywords = ['nearest', 'near', 'close', 'closest', 'around', 'nearby'];
  const jettyKeywords = ['jetty', 'jetties', 'terminal', 'stop', 'station'];
  
  return nearbyKeywords.some(nk => textLower.includes(nk)) && 
         jettyKeywords.some(jk => textLower.includes(jk));
};

export default function FerryChatComponent({ onClose }: ChatComponentProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      text: "👋 Hi! I'm your Lagos Ferry assistant. Ask me anything about ferry routes, jetties, schedules, fares, or how to get around Lagos by water!\n\n💡 Try asking: \"What's the nearest jetty to me?\"",
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
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
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

  // Request location permission
  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermissionGranted(true);
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        return true;
      } else {
        Alert.alert(
          "Location Permission Required",
          "Please enable location access in your device settings to find nearby jetties.",
          [{ text: "OK" }]
        );
        return false;
      }
    } catch (error) {
      console.error("Error requesting location:", error);
      return false;
    }
  };

  const handleNearestJettyQuery = async () => {
    // Check if we have location permission
    let hasLocation = locationPermissionGranted && userLocation;
    
    if (!hasLocation) {
      // Add system message requesting permission
      const permissionMessage: Message = {
        id: Date.now().toString(),
        text: "📍 To find the nearest jetty, I need access to your location. Please allow location access.",
        isUser: false,
        timestamp: new Date(),
        isSystemMessage: true,
      };
      setMessages((prev) => [...prev, permissionMessage]);

      // Request permission
      const granted = await requestLocationPermission();
      if (!granted) {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: "❌ I couldn't access your location. Please enable location services and try again.",
          isUser: false,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        return null;
      }
      
      hasLocation = true;
    }

    if (!ferryData || !userLocation) {
      return null;
    }

    // Find nearest jetties
    const nearestJetties = findNearestJetties(userLocation, ferryData.jetties, 5);
    
    return nearestJetties;
  };

  const sendMessage = async () => {
    if (!inputText.trim() || loading || !ferryData) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputText;
    setInputText("");
    setLoading(true);

    try {
      // Check if this is a nearest jetty query
      const isLocationQuery = isNearestJettyQuery(currentInput);
      let contextData;
      let dataLabel;

      if (isLocationQuery) {
        // Handle location-based query
        const nearestJetties = await handleNearestJettyQuery();
        
        if (!nearestJetties) {
          setLoading(false);
          return;
        }

        contextData = {
          jetties: nearestJetties,
          routes: [],
        };
        
        dataLabel = `(Location-Based: Showing ${nearestJetties.length} nearest jetties to user's current location)`;
      } else {
        // Regular keyword-based filtering
        const keywords = getKeywords(currentInput);
        const filteredData = filterDataByKeywords(ferryData, keywords);
        
        contextData = filteredData;
        dataLabel = filteredData.isSample 
          ? `(Sampled: Top 3 items, as no specific keywords were found)` 
          : `(Filtered: ${filteredData.jetties.length} Jetties, ${filteredData.routes.length} Routes relevant to "${keywords.join(', ')}")`;
      }

      // Create context for AI
      const context = `You are a helpful assistant for the Lagos Ferry system in Nigeria. Answer the user's question accurately using ONLY the data provided below. Do not mention that the data is filtered.

--- FERRY DATA CONTEXT ${dataLabel} ---

JETTIES:
${JSON.stringify(contextData.jetties, null, 2)}

ROUTES:
${JSON.stringify(contextData.routes, null, 2)}

--- END OF DATA CONTEXT ---

${isLocationQuery ? `
IMPORTANT: The jetties are sorted by distance from the user's current location. The "distance" field shows kilometers from the user.
When presenting nearest jetties:
1. Mention the distance in a user-friendly format (e.g., "1.2 km away")
2. List them in order from closest to farthest
3. Include the jetty name, location (LGA), and status
4. Provide helpful details like operating status and how to get there
` : ''}

Key information available: Jetty names, locations (LGA), status, ownership, quality, charter services, Route origins, destinations, stops, duration, fares, operators, operating hours, departure frequency, payment options, boat types.

When answering questions:
1. Be specific and helpful.
2. Reference actual jetty names and routes from the data, using **bold text** for the names (e.g., **Ebute Ero**).
3. Provide **fare information** when available.
4. Mention operating hours and schedules.
5. Suggest alternatives when relevant.
6. Keep responses concise but informative.
7. Use emojis SPARINGLY (max 3 total per response) to make responses friendly (⚓, 🚢, 💰, ⏰, 📍, etc.).
8. If you provide an external link, use the Markdown format: [Link Text](URL).

User question: ${currentInput}`;

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
            temperature: 0.5,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        console.error("Gemini API Error:", data.error);
        const errorMessage = data.error.message || "An unknown API error occurred.";
        throw new Error(`Gemini API Error: ${errorMessage}`);
      }

      const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (aiResponseText) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: aiResponseText,
          isUser: false,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
      } else if (data.candidates?.[0]?.finishReason === "SAFETY") {
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

  const renderMessageText = (message: Message) => {
    if (message.isUser) {
      return (
        <Text style={[styles.messageText, styles.userText]}>
          {message.text}
        </Text>
      );
    } else {
      return (
        <MarkdownText 
          text={message.text} 
          style={styles.messageText} 
          aiTextStyle={[styles.aiText, message.isSystemMessage && styles.systemText]} 
        />
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>🚢 Ferry Assistant</Text>
          <Text style={styles.headerSubtitle}>
            Ask about routes & schedules
            {locationPermissionGranted && " • 📍 Location Enabled"}
          </Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => setInputText("What's the nearest jetty to me?")}
          >
            <Text style={styles.quickActionText}>📍 Nearest Jetty</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => setInputText("Show me routes from CMS")}
          >
            <Text style={styles.quickActionText}>🗺️ Routes from CMS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => setInputText("How much is the fare?")}
          >
            <Text style={styles.quickActionText}>💰 Fares</Text>
          </TouchableOpacity>
        </ScrollView>
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
              message.isSystemMessage && styles.systemBubble,
            ]}
          >
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

      {/* Input Area */}
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
  quickActions: {
    backgroundColor: "white",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  quickActionButton: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickActionText: {
    fontSize: 13,
    color: "#475569",
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
  systemBubble: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
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
  systemText: {
    color: "#92400E",
  },
  boldText: {
    fontWeight: 'bold',
  },
  linkText: {
    color: '#0EA5E9',
    textDecorationLine: 'underline',
  },
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