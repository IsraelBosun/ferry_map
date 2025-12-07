import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

interface JettyFeature {
  type: string;
  properties: {
    ferry_stop_id: string;
    name: string;
    LGA: string;
    charter_services: string;
    [key: string]: any;
  };
  geometry: any;
}

interface FilterOptions {
  selectedLGAs: string[];
  selectedCharterServices: string[];
}

interface JettyFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  jetties: JettyFeature[];
  onFilterChange: (filteredJetties: JettyFeature[]) => void;
}

const JettyFilterDrawer: React.FC<JettyFilterDrawerProps> = ({
  isOpen,
  onClose,
  jetties,
  onFilterChange,
}) => {
  const [slideAnim] = useState(new Animated.Value(-width * 0.8));
  const [overlayOpacity] = useState(new Animated.Value(0));

  // Extract unique LGAs and charter service options
  const uniqueLGAs = Array.from(new Set(jetties.map((j) => j.properties.LGA))).sort();
  const charterOptions = ["Yes", "No"];

  // Filter state
  const [selectedLGAs, setSelectedLGAs] = useState<string[]>([...uniqueLGAs]);
  const [selectedCharterServices, setSelectedCharterServices] = useState<string[]>([
    ...charterOptions,
  ]);

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 65,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -width * 0.8,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  useEffect(() => {
    applyFilters();
  }, [selectedLGAs, selectedCharterServices]);

  const applyFilters = () => {
    const filtered = jetties.filter((jetty) => {
      const lgaMatch = selectedLGAs.includes(jetty.properties.LGA);
      const charterMatch = selectedCharterServices.includes(
        jetty.properties.charter_services
      );
      return lgaMatch && charterMatch;
    });
    onFilterChange(filtered);
  };

  const toggleLGA = (lga: string) => {
    setSelectedLGAs((prev) =>
      prev.includes(lga) ? prev.filter((l) => l !== lga) : [...prev, lga]
    );
  };

  const toggleCharterService = (service: string) => {
    setSelectedCharterServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const selectAllLGAs = () => {
    if (selectedLGAs.length === uniqueLGAs.length) {
      setSelectedLGAs([]);
    } else {
      setSelectedLGAs([...uniqueLGAs]);
    }
  };

  const selectAllCharterServices = () => {
    if (selectedCharterServices.length === charterOptions.length) {
      setSelectedCharterServices([]);
    } else {
      setSelectedCharterServices([...charterOptions]);
    }
  };

  const resetFilters = () => {
    setSelectedLGAs([...uniqueLGAs]);
    setSelectedCharterServices([...charterOptions]);
  };

  const getFilterCount = () => {
    const totalFilters = uniqueLGAs.length + charterOptions.length;
    const activeFilters = selectedLGAs.length + selectedCharterServices.length;
    return activeFilters === totalFilters ? 0 : totalFilters - activeFilters;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: overlayOpacity,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <SafeAreaView style={styles.drawerHeader}>
          <View>
            <Text style={styles.drawerTitle}>Filter Jetties</Text>
            <Text style={styles.drawerSubtitle}>
              {jetties.length} total • {selectedLGAs.length + selectedCharterServices.length - uniqueLGAs.length - charterOptions.length === 0 ? 'All' : getFilterCount() + ' filtered'}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </SafeAreaView>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* LGA Filter Section */}
          <View style={styles.filterSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📍 Local Government Area</Text>
              <TouchableOpacity onPress={selectAllLGAs}>
                <Text style={styles.selectAllText}>
                  {selectedLGAs.length === uniqueLGAs.length ? "Deselect All" : "Select All"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionsContainer}>
              {uniqueLGAs.map((lga) => {
                const isSelected = selectedLGAs.includes(lga);
                const count = jetties.filter((j) => j.properties.LGA === lga).length;
                return (
                  <TouchableOpacity
                    key={lga}
                    style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                    onPress={() => toggleLGA(lga)}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                        {lga}
                      </Text>
                      <Text style={[styles.optionCount, isSelected && styles.optionCountSelected]}>
                        {count}
                      </Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Charter Services Filter Section */}
          <View style={styles.filterSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>⚡ Charter Services</Text>
              <TouchableOpacity onPress={selectAllCharterServices}>
                <Text style={styles.selectAllText}>
                  {selectedCharterServices.length === charterOptions.length
                    ? "Deselect All"
                    : "Select All"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionsContainer}>
              {charterOptions.map((service) => {
                const isSelected = selectedCharterServices.includes(service);
                const count = jetties.filter(
                  (j) => j.properties.charter_services === service
                ).length;
                return (
                  <TouchableOpacity
                    key={service}
                    style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                    onPress={() => toggleCharterService(service)}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                        {service === "Yes" ? "Charter Available" : "No Charter"}
                      </Text>
                      <Text style={[styles.optionCount, isSelected && styles.optionCountSelected]}>
                        {count}
                      </Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Reset Button */}
          <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
            <Text style={styles.resetButtonText}>🔄 Reset All Filters</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 100,
  },
  overlayTouchable: {
    flex: 1,
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: width * 0.8,
    backgroundColor: "white",
    zIndex: 101,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 20,
    paddingBottom: 20,
    backgroundColor: "#0EA5E9",
  },
  drawerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
  },
  drawerSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 20,
    color: "white",
    fontWeight: "bold",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  filterSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1E293B",
  },
  selectAllText: {
    fontSize: 13,
    color: "#0EA5E9",
    fontWeight: "600",
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },
  optionButtonSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#0EA5E9",
  },
  optionContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginRight: 12,
  },
  optionText: {
    fontSize: 15,
    color: "#475569",
    fontWeight: "500",
  },
  optionTextSelected: {
    color: "#0EA5E9",
    fontWeight: "600",
  },
  optionCount: {
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "600",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  optionCountSelected: {
    backgroundColor: "#DBEAFE",
    color: "#0EA5E9",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: "#0EA5E9",
    borderColor: "#0EA5E9",
  },
  checkmark: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  resetButton: {
    marginHorizontal: 20,
    marginTop: 24,
    padding: 16,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  resetButtonText: {
    fontSize: 15,
    color: "#64748B",
    fontWeight: "600",
  },
});

export default JettyFilterDrawer;