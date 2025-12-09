import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Platform,
  Text,
  TouchableOpacity,
  Linking,
  Animated,
  Dimensions,
  ScrollView,
  Image,
  StatusBar,
  Modal,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import FerryChatComponent from "@/components/FerryChatComponent";
import JettyFilterDrawer from "@/components/JettyFilterDrawer";

// Data Source URLs
const JETTIES_URL = "https://stears-flourish-data.s3.amazonaws.com/jetties.json";
const ROUTES_URL = "https://stears-flourish-data.s3.amazonaws.com/routes.json";

// --- Type Definitions ---
type Coordinate = [number, number, number];

interface JettyFeature {
  type: string;
  properties: {
    ferry_stop_id: string;
    name: string;
    LGA: string;
    status_map: string;
    charter_services: string;
    google_maps_url: string;
    type: string;
    quality: string;
    ownership: string;
    status: string;
    passenger: string;
    s3_url: string;
  };
  geometry: { type: string; coordinates: Coordinate };
}

interface OperatorDetails {
  operational_category?: string;
  cost_to_final_destination?: string;
  duration_between_stops?: string;
  operating_hours?: string;
  departure_trigger?: string;
  departure_frequency?: string;
  payment_options?: string;
  boat_types?: string;
  peak_only?: string;
  rain?: string;
  weekend?: string;
  schedule?: string;
  notes?: string;
}

interface RouteFeature {
  type: string;
  properties: {
    route_id: number;
    origin: string;
    destination: string;
    stops_along_the_route?: string;
    duration_to_final_destination?: string;
    operator?: {
      Public?: OperatorDetails;
      Private?: OperatorDetails;
    };
  };
  geometry: { type: string; coordinates: Coordinate[] };
}

const { height, width } = Dimensions.get("window");

export default function App() {
  const [jetties, setJetties] = useState<JettyFeature[]>([]);
  const [routes, setRoutes] = useState<RouteFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  
  const [selectedJetty, setSelectedJetty] = useState<JettyFeature | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteFeature | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [showFullSchedule, setShowFullSchedule] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const [filteredJetties, setFilteredJetties] = useState<JettyFeature[]>([]);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const mapRef = useRef<MapView>(null);
  const slideAnim = useState(new Animated.Value(0))[0];
  const legendAnim = useState(new Animated.Value(0))[0];
  const scheduleAnim = useState(new Animated.Value(0))[0];
  const isModalVisible = selectedJetty !== null || selectedRoute !== null;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [jettiesRes, routesRes] = await Promise.all([fetch(JETTIES_URL), fetch(ROUTES_URL)]);
        const jettiesJson = await jettiesRes.json();
        const routesJson = await routesRes.json();

        setJetties(jettiesJson.features);
        setRoutes(routesJson.features);

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.warn("Permission denied for location");
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });

        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5 },
          (loc) => {
            setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        );
      } catch (err) {
        console.error("Error fetching data or location:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    setFilteredJetties(jetties);
  }, [jetties]);

  useEffect(() => {
    if (isModalVisible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 65,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
      setShowFullSchedule(false);
    }
  }, [isModalVisible]);

  useEffect(() => {
    Animated.timing(legendAnim, {
      toValue: showLegend ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showLegend]);

  useEffect(() => {
    Animated.spring(scheduleAnim, {
      toValue: showFullSchedule ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 65,
    }).start();
  }, [showFullSchedule]);

  const centerToUserLocation = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
    }
  };

  const getStatusColor = (status: string) => {
    const statusLower = status?.toLowerCase();
    if (statusLower?.includes('completed') || statusLower?.includes('operational')) return '#10B981';
    if (statusLower?.includes('construction')) return '#F59E0B';
    if (statusLower?.includes('non-operational')) return '#EF4444';
    return '#6B7280';
  };

  const getQualityBadge = (quality: string) => {
    const qualityLower = quality?.toLowerCase();
    if (qualityLower?.includes('developed')) return '#10B981';
    if (qualityLower?.includes('less')) return '#F59E0B';
    if (qualityLower?.includes('poor')) return '#EF4444';
    return '#3B82F6';
  };

  const renderJettyDetails = (jetty: JettyFeature) => {
    return (
      <View style={styles.detailsContent}>
        <View style={styles.headerSection}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>{jetty.properties.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(jetty.properties.status) + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(jetty.properties.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(jetty.properties.status) }]}>
                {jetty.properties.status}
              </Text>
            </View>
          </View>
          <Text style={styles.lgaText}>📍 {jetty.properties.LGA}</Text>
        </View>

        {jetty.properties.s3_url && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: jetty.properties.s3_url }}
              style={styles.image}
              resizeMode="cover"
            />
            <View style={styles.imageOverlay}>
              <View style={[styles.qualityBadge, { backgroundColor: getQualityBadge(jetty.properties.quality) }]}>
                <Text style={styles.qualityText}>⭐ {jetty.properties.quality}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.infoGrid}>
          <InfoCard icon="🏢" label="Ownership" value={jetty.properties.ownership} />
          <InfoCard icon="🚢" label="Type" value={jetty.properties.type} />
          <InfoCard icon="👥" label="Passenger" value={jetty.properties.passenger} />
          <InfoCard icon="⚡" label="Charter" value={jetty.properties.charter_services} />
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => {
            const url = jetty.properties.google_maps_url?.trim();
            if (url) {
              Linking.openURL(url);
            }
          }}
        >
          <Text style={styles.primaryButtonText}>🗺️  Navigate to Jetty</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderRouteDetails = (route: RouteFeature) => {
    const hasPublic = !!route.properties.operator?.Public;
    const hasPrivate = !!route.properties.operator?.Private;
    const operatorType = hasPublic ? "Public" : hasPrivate ? "Private" : "N/A";
    const serviceDetails = route.properties.operator?.[operatorType as keyof typeof route.properties.operator];
    const isPublic = operatorType === "Public";

    return (
      <View style={styles.detailsContent}>
        <View style={styles.headerSection}>
          <Text style={styles.cardTitle}>Ferry Route</Text>
          <View style={styles.routeHeader}>
            <View style={styles.routePoint}>
              <View style={styles.routeDot} />
              <Text style={styles.routeLocation}>{route.properties.origin}</Text>
            </View>
            <View style={styles.routeLine} />
            {route.properties.stops_along_the_route && route.properties.stops_along_the_route !== 'No stops' && (
              <>
                <Text style={styles.stopsText}>🚏 {route.properties.stops_along_the_route}</Text>
                <View style={styles.routeLine} />
              </>
            )}
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, styles.routeDotEnd]} />
              <Text style={styles.routeLocation}>{route.properties.destination}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.operatorBadge, { backgroundColor: isPublic ? '#10B98120' : '#EF444420' }]}>
          <Text style={[styles.operatorText, { color: isPublic ? '#10B981' : '#EF4444' }]}>
            {isPublic ? '🏛️' : '🚤'} {operatorType} Ferry Service
          </Text>
        </View>

        <View style={styles.fareSection}>
          <View style={styles.fareCard}>
            <Text style={styles.fareLabel}>Fare</Text>
            <Text style={styles.fareAmount}>
              {serviceDetails?.cost_to_final_destination || 'Contact operator'}
            </Text>
          </View>
          <View style={styles.fareCard}>
            <Text style={styles.fareLabel}>Duration</Text>
            <Text style={styles.fareAmount}>
              {route.properties.duration_to_final_destination || serviceDetails?.duration_between_stops || 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleLabel}>⏰ Operating Hours</Text>
          <Text style={styles.scheduleTime}>{serviceDetails?.operating_hours || 'Contact operator'}</Text>
        </View>

        {serviceDetails?.departure_frequency && (
          <View style={styles.scheduleCard}>
            <Text style={styles.scheduleLabel}>🕐 Departure Frequency</Text>
            <Text style={styles.scheduleTime}>{serviceDetails.departure_frequency}</Text>
          </View>
        )}

        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => setShowFullSchedule(!showFullSchedule)}
        >
          <Text style={styles.primaryButtonText}>
            {showFullSchedule ? '📅 Hide Full Details' : '📅 View Full Schedule'}
          </Text>
        </TouchableOpacity>

        {showFullSchedule && (
          <Animated.View
            style={[
              styles.fullScheduleContainer,
              {
                opacity: scheduleAnim,
                transform: [{
                  scaleY: scheduleAnim,
                }],
              },
            ]}
          >
            <View style={styles.scheduleDetailCard}>
              <Text style={styles.scheduleDetailTitle}>📋 Complete Service Details</Text>
              
              {serviceDetails?.boat_types && (
                <DetailRow icon="🚢" label="Boat Types" value={serviceDetails.boat_types} />
              )}
              
              {serviceDetails?.payment_options && (
                <DetailRow icon="💳" label="Payment Options" value={serviceDetails.payment_options} />
              )}
              
              {serviceDetails?.departure_trigger && (
                <DetailRow icon="🚦" label="Departure Policy" value={serviceDetails.departure_trigger} />
              )}
              
              {serviceDetails?.schedule && (
                <DetailRow icon="📅" label="Operating Days" value={serviceDetails.schedule} />
              )}
              
              {serviceDetails?.peak_only && (
                <DetailRow icon="⏱️" label="Peak Hours" value={serviceDetails.peak_only} />
              )}
              
              {serviceDetails?.rain && (
                <DetailRow icon="🌧️" label="Weather Policy" value={serviceDetails.rain} />
              )}
              
              {serviceDetails?.weekend && (
                <DetailRow icon="📆" label="Weekend Schedule" value={serviceDetails.weekend} />
              )}
              
              {serviceDetails?.notes && serviceDetails.notes !== 'nan' && (
                <DetailRow icon="📝" label="Additional Notes" value={serviceDetails.notes} />
              )}
              
              {serviceDetails?.operational_category && (
                <DetailRow icon="🏷️" label="Category" value={serviceDetails.operational_category} />
              )}
            </View>

            {hasPublic && hasPrivate && (
              <View style={styles.scheduleDetailCard}>
                <Text style={styles.scheduleDetailTitle}>
                  {isPublic ? '🚤 Private Service Alternative' : '🏛️ Public Service Alternative'}
                </Text>
                {renderAlternativeOperator(route, !isPublic)}
              </View>
            )}
          </Animated.View>
        )}
      </View>
    );
  };

  const renderAlternativeOperator = (route: RouteFeature, showPublic: boolean) => {
    const altDetails = showPublic ? route.properties.operator?.Public : route.properties.operator?.Private;
    if (!altDetails) return null;

    return (
      <View>
        {altDetails.cost_to_final_destination && (
          <DetailRow icon="💰" label="Fare" value={altDetails.cost_to_final_destination} />
        )}
        {altDetails.operating_hours && (
          <DetailRow icon="⏰" label="Hours" value={altDetails.operating_hours} />
        )}
        {altDetails.departure_frequency && (
          <DetailRow icon="🕐" label="Frequency" value={altDetails.departure_frequency} />
        )}
        {altDetails.boat_types && (
          <DetailRow icon="🚢" label="Boats" value={altDetails.boat_types} />
        )}
      </View>
    );
  };

  const closeModal = () => {
    setSelectedJetty(null);
    setSelectedRoute(null);
  };

  if (loading || !location) {
    return (
      <View style={styles.loader}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#0EA5E9" />
          <Text style={styles.loadingText}>Loading Lagos Ferry Network...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Fixed Header */}
      <SafeAreaView style={styles.header}>
          <TouchableOpacity 
          style={styles.locationButton}
          onPress={() => setShowFilterDrawer(true)}
        >
          <Text style={styles.filterButtonText}>☰</Text>
          {filteredJetties.length < jetties.length && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filteredJetties.length}</Text>
            </View>
          )}       
           </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={styles.appTitle}>Lagos Ferry</Text>
          <Text style={styles.appSubtitle}>Water Transport Navigator</Text>
        </View>

        <TouchableOpacity 
          style={styles.legendButton}
          onPress={() => setShowLegend(!showLegend)}
        >
          <Text style={styles.legendButtonText}>{showLegend ? '✕' : 'ℹ️'}</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Floating Chat Button */}
      <TouchableOpacity 
        style={styles.floatingChatButton}
        onPress={() => setShowChat(true)}
      >
        <Text style={styles.floatingChatIcon}>💬</Text> 
      </TouchableOpacity>

      {/* Chat Modal */}
      <Modal 
        visible={showChat} 
        animationType="slide"
        onRequestClose={() => setShowChat(false)}
      >
        <FerryChatComponent onClose={() => setShowChat(false)} />
      </Modal>

      {/* Legend Panel */}
      {showLegend && (
        <Animated.View
          style={[
            styles.legendPanel,
            {
              opacity: legendAnim,
              transform: [{
                translateY: legendAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-200, 0],
                }),
              }],
            },
          ]}
        >
          <Text style={styles.legendTitle}>Map Legend</Text>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#10B981' }]} />
            <Text style={styles.legendText}>Public Ferry Routes</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>Private Ferry Routes (Dashed)</Text>
          </View>
          <View style={styles.legendItem}>
            <Text style={styles.markerIconSmall}>⚓</Text>
            <Text style={styles.legendText}>Ferry Jetties</Text>
          </View>
        </Animated.View>
      )}
      
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        showsUserLocation={true}
        followsUserLocation={false}
        showsMyLocationButton={true}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        onPress={closeModal}
      >
        {filteredJetties.map((jetty, index) => (
          <Marker
            key={`jetty-${jetty.properties.ferry_stop_id}-${index}`}
            coordinate={{
              latitude: jetty.geometry.coordinates[1],
              longitude: jetty.geometry.coordinates[0],
            }}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedRoute(null);
              setSelectedJetty(jetty);
            }}
          >
            <View style={[
              styles.customMarker,
              selectedJetty === jetty && styles.customMarkerSelected
            ]}>
              <Text style={styles.markerIcon}>⚓</Text>
            </View>
          </Marker>
        ))}

        {routes.map((route, index) => {
          const isSelected = selectedRoute === route;
          const isPublic = !!route.properties.operator?.Public;
          
          return (
            <Polyline
              key={`route-${route.properties.route_id}-${index}`}
              coordinates={route.geometry.coordinates.map((c) => ({
                latitude: c[1],
                longitude: c[0],
              }))}
              strokeColor={isPublic ? "#10B981" : "#EF4444"}
              strokeWidth={isSelected ? 4 : 1.3}
              lineDashPattern={isPublic ? undefined : [10, 3]}
              tappable={true}
              onPress={() => {
                setSelectedJetty(null);
                setSelectedRoute(route);
              }}
            />
          );
        })}
      </MapView>

      {/* Details Card */}
      {isModalVisible && (
        <Animated.View
          style={[
            styles.cardContainer,
            {
              opacity: slideAnim,
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.card}>
            <View style={styles.cardHandle} />
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {selectedJetty ? renderJettyDetails(selectedJetty) : renderRouteDetails(selectedRoute!)}

              <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Animated.View>
      )}

      {/* Filter Drawer */}
      <JettyFilterDrawer
        isOpen={showFilterDrawer}
        onClose={() => setShowFilterDrawer(false)}
        jetties={jetties}
        onFilterChange={setFilteredJetties}
      />
    </View>
  );
}

const InfoCard = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <View style={styles.infoCard}>
    <Text style={styles.infoIcon}>{icon}</Text>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const DetailRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailRowIcon}>{icon}</Text>
    <View style={styles.detailRowContent}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  locationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationIcon: {
    fontSize: 20,
  },
  headerContent: {
    flex: 1,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0EA5E9',
    marginBottom: 2,
  },
  appSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    position: 'relative',
  },
  filterButtonText: {
    fontSize: 20,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#0EA5E9',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  filterBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  legendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  legendButtonText: {
    fontSize: 20,
  },
  legendPanel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 110,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 220,
    zIndex: 20,
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  legendLine: {
    width: 30,
    height: 4,
    borderRadius: 2,
    marginRight: 10,
  },
  legendText: {
    fontSize: 13,
    color: '#475569',
  },
  markerIconSmall: {
    fontSize: 18,
    marginRight: 10,
  },
  map: { flex: 1 },
  loader: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center",
    backgroundColor: '#0EA5E9',
  },
  loadingCard: {
    backgroundColor: 'white',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#334155',
    fontWeight: '600',
  },
  customMarker: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customMarkerSelected: {
    borderColor: '#FF4500',
    backgroundColor: '#FFE5CC',
  },
  markerIcon: {
    fontSize: 14,
    lineHeight: 16,
  },
  cardContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.4,
  },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 20,
  },
  cardHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  detailsContent: {
    flex: 1,
  },
  headerSection: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E293B',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  lgaText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  image: {
    width: "100%",
    height: 180,
    borderRadius: 16,
  },
  imageOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  qualityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  qualityText: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  infoCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
  },
  routeHeader: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    marginRight: 10,
  },
  routeDotEnd: {
    backgroundColor: '#EF4444',
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#CBD5E1',
    marginLeft: 5,
    marginBottom: 8,
  },
  routeLocation: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  stopsText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 22,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  operatorBadge: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  operatorText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  fareSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  fareCard: {
    flex: 1,
    backgroundColor: '#0EA5E9',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  fareLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    marginBottom: 4,
  },
  fareAmount: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  },
  scheduleCard: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scheduleLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 6,
  },
  scheduleTime: {
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '600',
  },
  fullScheduleContainer: {
    marginTop: 16,
    overflow: 'hidden',
  },
  scheduleDetailCard: {
    backgroundColor: '#F1F5F9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0EA5E9',
  },
  scheduleDetailTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  detailRowIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  detailRowContent: {
    flex: 1,
  },
  detailRowLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailRowValue: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#0EA5E9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: "#0EA5E9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  closeButtonText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
  floatingChatButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 25,
    right: 20,
    backgroundColor: '#0EA5E9',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 50,
  },
  floatingChatIcon: {
    fontSize: 28,
  },
});