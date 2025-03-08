import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Keyboard,
  Platform,
  PermissionsAndroid,
  Text,
  ScrollView,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import Geolocation from "react-native-geolocation-service";
import "react-native-get-random-values";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

const { height } = Dimensions.get("window");
const SEARCH_BAR_HEIGHT = 50;
const INITIAL_TOP = (height - SEARCH_BAR_HEIGHT) / 2 - 100;
const TOP_POSITION = 20;

const SearchScreen = ({ navigation }) => {
  const [searchedLocation, setSearchedLocation] = useState(null);
  const [routeDistance, setRouteDistance] = useState(null);
  const [location, setLocation] = useState(null);
  const [travelMode, setTravelMode] = useState("driving");
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [sliderHeight, setSliderHeight] = useState(0);

  const searchBarTop = useRef(new Animated.Value(INITIAL_TOP)).current;
  const labelOpacity = useRef(new Animated.Value(1)).current;
  const mapOpacityAnim = useRef(new Animated.Value(0)).current;
  const mapRef = useRef(null);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    if (Platform.OS === "ios") {
      const status = await Geolocation.requestAuthorization("whenInUse");
      if (status === "granted") {
        getLocation();
      }
    } else {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "Turn on location to see your current position on the map",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          getLocation();
        } else {
          console.log("Location permission denied");
        }
      } catch (err) {
        console.warn(err);
      }
    }
  };

  const getLocation = () => {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ latitude, longitude });
      },
      (error) => {
        console.log(error.code, error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  useEffect(() => {
    const watchId = Geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ latitude, longitude });
      },
      (error) => console.log("WatchPosition Error:", error),
      {
        enableHighAccuracy: true,
        distanceFilter: 10,
        interval: 5000,
        fastestInterval: 2000,
      }
    );
    return () => {
      if (watchId) Geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (location && searchedLocation) {
      getRouteDirection(travelMode);
    }
  }, [location, searchedLocation, travelMode]);

  const bottomSliderAnim = useRef(new Animated.Value(100)).current;

  const handleFocus = () => {
    Animated.sequence([
      Animated.timing(labelOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.timing(searchBarTop, {
          toValue: TOP_POSITION,
          duration: 700,
          useNativeDriver: false,
        }),
        Animated.timing(mapOpacityAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(bottomSliderAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: false,
        }),
      ]),
    ]).start();
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(mapOpacityAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(searchBarTop, {
        toValue: INITIAL_TOP,
        duration: 700,
        useNativeDriver: false,
      }),
      Animated.timing(labelOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }),

      Animated.timing(bottomSliderAnim, {
        toValue: sliderHeight,
        duration: 700,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const dismissKeyboardAndReset = () => {
    Keyboard.dismiss();
  };

  const centerMap = (region) => {
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        { ...region, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        1000
      );
    } else {
      console.log("mapRef is not available");
    }
  };

  // const fitMapToMarkers = () => {
  //   if (location && searchedLocation && mapRef.current) {
  //     mapRef.current.fitToCoordinates([location, searchedLocation], {
  //       edgePadding: { top: 100, right: 100, bottom: 100, left: 100 },
  //       animated: true,
  //     });
  //   }
  // };

  const decodePolyline = (encoded) => {
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;
    const coordinates = [];

    while (index < len) {
      // For the latitude
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      // For the longitude
      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      // Add to coordinates array
      coordinates.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return coordinates;
  };

  const getRouteDirection = async (mode) => {
    if (!location || !searchedLocation) return;
    const origin = `${location.latitude},${location.longitude}`;
    const destination = `${searchedLocation.latitude},${searchedLocation.longitude}`;
    const apiKey = process.env.EXPO_PUBLIC_DISTANCE_MATRIX_KEY;
    let modeParam = mode;
    let transitParam = "";
    if (mode === "bus") {
      modeParam = "transit";
      transitParam = "&transit_mode=bus";
    } else if (mode === "bicycle") {
      modeParam = "bicycling";
    }
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=${modeParam}${transitParam}&key=${apiKey}`;
    try {
      const response = await fetch(url);
      const json = await response.json();
      if (json.routes && json.routes.length) {
        const distanceText = json.routes[0].legs[0].distance.text;
        setRouteDistance(distanceText);

        const points = json.routes[0].overview_polyline.points;

        const routeCoords = decodePolyline(points);
        setRouteCoordinates(routeCoords);

        if (routeCoords.length > 0 && mapRef.current) {
          mapRef.current.fitToCoordinates(routeCoords, {
            edgePadding: { top: 100, right: 50, bottom: 150, left: 50 },
            animated: true,
          });
        }
      } else {
        console.log("No routes found");
        setRouteDistance("Route not found");
        setRouteCoordinates([]);
      }
    } catch (error) {
      console.error(error);
      setRouteDistance("Error fetching route");
      setRouteCoordinates([]);
    }
  };

  const handleTransitMode = (mode) => {
    setTravelMode(mode);
    getRouteDirection(mode);
  };

  const getIconName = (mode) => {
    switch (mode) {
      case "walking":
        return "walk-outline";
      case "driving":
        return "car-outline";
      case "bus":
        return "bus-outline";
      case "bicycle":
        return "bicycle-outline";
      default:
        return "car";
    }
  };
  const getRouteColor = () => {
    switch (travelMode) {
      case "walking":
        return "#4CAF50";
      case "driving":
        return "#fffff";
      case "bus":
        return "#FF9800";
      case "bicycle":
        return "#9C27B0";
      default:
        return "#2196F3";
    }
  };
  const handleCloseFunction = () => {
    setModalVisible(false);
    handleClose();
  };
  useEffect(() => {
    if (location && searchedLocation) {
      const timer = setTimeout(() => {
        getRouteDirection(travelMode);
        setModalVisible(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [searchedLocation, location, travelMode]);

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboardAndReset}>
      <View style={styles.container}>
        <StatusBar style="auto" />

        <Animated.View
          style={[styles.mapContainer, { opacity: mapOpacityAnim }]}
        >
          <MapView
            ref={(ref) => (mapRef.current = ref)}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: location ? location.latitude : 37.78825,
              longitude: location ? location.longitude : -122.4324,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            showsUserLocation={true}
          >
            {searchedLocation && (
              <Marker
                coordinate={searchedLocation}
                title="Destination"
                pinColor="blue"
              />
            )}

            {routeCoordinates.length > 0 && (
              <Polyline
                coordinates={routeCoordinates}
                strokeWidth={7}
                strokeColor={getRouteColor()}
              />
            )}
          </MapView>
          <View style={styles.floatingButtonsContainer}>
            <TouchableOpacity
              style={styles.floatingButton}
              onPress={() => location && centerMap(location)}
            >
              <Ionicons name="locate-outline" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.floatingButton, { marginTop: 10 }]}
              onPress={handleClose}
            >
              <Ionicons name="arrow-undo-outline" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View
          style={[styles.animatedContainer, { top: searchBarTop }]}
        >
          <Animated.Text style={[styles.label, { opacity: labelOpacity }]}>
            Where's your next{" "}
            <Animated.Text style={{ color: "#4681f4" }}>
              adventure
            </Animated.Text>
            ?
          </Animated.Text>
          <GooglePlacesAutocomplete
            fetchDetails={true}
            placeholder="Search place..."
            onPress={(data, details = null) => {
              const { lat, lng } = details.geometry.location;
              const newLocation = { latitude: lat, longitude: lng };
              setSearchedLocation(newLocation);
              centerMap(newLocation);
              setTravelMode("driving");
              setRouteCoordinates([]);
            }}
            query={{
              key: process.env.EXPO_PUBLIC_AUTOCOMPLETE_KEY,
              language: "en",
            }}
            textInputProps={{ onFocus: handleFocus }}
            styles={{
              container: { flex: 0 },
              textInputContainer: {
                backgroundColor: "white",
                borderColor: "#d9d9e9",
                borderWidth: 1,
                borderRadius: 5,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                elevation: 5,
                zIndex: 99,
              },
              textInput: {
                height: SEARCH_BAR_HEIGHT,
                color: "#5d5d5d",
                fontSize: 16,
              },
              listView: {
                marginTop: 15,
                borderColor: "#d9d9e9",
                borderWidth: 1,
                borderRadius: 5,
                backgroundColor: "white",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                elevation: 5,
              },
              predefinedPlacesDescription: { color: "#1faadb" },
            }}
          />
        </Animated.View>

        {searchedLocation && (
          <View style={styles.modalOverlay} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.bottomSlider,
                { transform: [{ translateY: bottomSliderAnim }] },
              ]}
              onLayout={(event) => {
                const { height: layoutHeight } = event.nativeEvent.layout;
                if (layoutHeight !== sliderHeight) {
                  setSliderHeight(layoutHeight);
                  bottomSliderAnim.setValue(layoutHeight);
                }
                // if (sliderHeight === 0) {
                //   setSliderHeight(layoutHeight);
                //   bottomSliderAnim.setValue(layoutHeight);
                // }
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 20,
                }}
              >
                {routeDistance && (
                  <View style={styles.distanceContainer}>
                    <Ionicons
                      name={getIconName(travelMode)}
                      size={60}
                      color="black"
                      style={styles.distanceIcon}
                    />
                    <View
                      style={{
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={styles.distanceModeText}>
                        {" "}
                        {travelMode.charAt(0).toUpperCase() +
                          travelMode.slice(1)}
                      </Text>
                      <Text style={styles.distanceText}>{routeDistance}</Text>
                    </View>
                  </View>
                )}
                <TouchableOpacity
                  style={{
                    backgroundColor: "#e8ebed",
                    width: 40,
                    height: 40,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    borderRadius: 100,
                  }}
                  onPress={handleCloseFunction}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={30}
                    color="black"
                  />
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.buttonRow}
              >
                <TouchableOpacity
                  style={[
                    styles.button,
                    travelMode === "driving" && styles.activeButton,
                  ]}
                  onPress={() => handleTransitMode("driving")}
                >
                  <MaterialCommunityIcons
                    name="car"
                    size={20}
                    color={travelMode === "driving" ? "white" : "black"}
                  />
                  <Text
                    style={[
                      styles.buttonText,
                      {
                        color: travelMode === "driving" ? "white" : "black",
                        marginLeft: 5,
                      },
                    ]}
                  >
                    Driving
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.button,
                    travelMode === "bus" && styles.activeButton,
                  ]}
                  onPress={() => handleTransitMode("bus")}
                >
                  <MaterialCommunityIcons
                    name="bus"
                    size={20}
                    color={travelMode === "bus" ? "white" : "black"}
                  />
                  <Text
                    style={[
                      styles.buttonText,
                      {
                        color: travelMode === "bus" ? "white" : "black",
                        marginLeft: 5,
                      },
                    ]}
                  >
                    Bus
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.button,
                    travelMode === "bicycle" && styles.activeButton,
                  ]}
                  onPress={() => handleTransitMode("bicycle")}
                >
                  <MaterialCommunityIcons
                    name="bike"
                    size={20}
                    color={travelMode === "bicycle" ? "white" : "black"}
                  />
                  <Text
                    style={[
                      styles.buttonText,
                      {
                        color: travelMode === "bicycle" ? "white" : "black",
                        marginLeft: 5,
                      },
                    ]}
                  >
                    Bicycle
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.button,
                    travelMode === "walking" && styles.activeButton,
                  ]}
                  onPress={() => handleTransitMode("walking")}
                >
                  <MaterialCommunityIcons
                    name="walk"
                    size={20}
                    color={travelMode === "walking" ? "white" : "black"}
                  />
                  <Text
                    style={[
                      styles.buttonText,
                      {
                        color: travelMode === "walking" ? "white" : "black",
                        marginLeft: 5,
                      },
                    ]}
                  >
                    Walking
                  </Text>
                </TouchableOpacity>
              </ScrollView>
              <View style={{ flexDirection: "row", justifyContent: "center" }}>
                <TouchableOpacity
                  style={{
                    width: "95%",
                    flexDirection: "row",
                    justifyContent: "center",
                    backgroundColor: "#4681f4",
                    margin: 10,
                    marginTop: 25,
                    borderRadius: 5,
                    marginBottom: 20,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontSize: 18,
                      padding: 10,
                      fontWeight: "bold",
                    }}
                  >
                    Start Live Map
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

export default SearchScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
  mapContainer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  map: { width: "100%", height: "100%" },
  animatedContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 1,
  },
  label: {
    fontSize: 20,
    marginBottom: 20,
    textAlign: "center",
    fontWeight: "bold",
  },
  // bottomSlider: {
  //   position: "absolute",
  //   bottom: 0,
  //   left: 0,
  //   right: 0,
  //   backgroundColor: "rgba(255,255,255,0.95)",
  //   paddingVertical: 15,
  //   paddingHorizontal: 20,
  //   borderTopLeftRadius: 20,
  //   borderTopRightRadius: 20,
  //   elevation: 10,
  //   zIndex: 2,
  //   paddingTop: 20,
  // },

  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",

    marginLeft: 10,
    marginRight: 10,
    marginTop: 20,
  },

  button: {
    backgroundColor: "white",
    borderColor: "#d9d9e9",
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 5,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    width: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  activeButton: {
    backgroundColor: "#4681f4",
    borderColor: "#4681f4",
  },
  buttonText: {
    fontWeight: "bold",
    color: "black",
  },
  distanceContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  distanceText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4681f4",
    marginLeft: 9,
  },
  distanceIcon: {
    marginLeft: 8,
  },
  distanceModeText: {
    fontSize: 26,
    fontWeight: "600",
    color: "black",
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomSlider: {
    backgroundColor: "white",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 10,
    zIndex: 2,
    paddingTop: 20,
  },
  floatingButtonsContainer: {
    position: "absolute",
    bottom: 20,
    right: 20,
    alignItems: "center",
  },
  floatingButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#4681f4",
    justifyContent: "center",
    alignItems: "center",
  },
});
const mapStyle = [
  {
    featureType: "administrative.land_parcel",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "administrative.locality",
    stylers: [
      {
        visibility: "simplified",
      },
    ],
  },
  {
    featureType: "administrative.neighborhood",
    stylers: [
      {
        visibility: "on",
      },
    ],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "geometry",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "geometry.fill",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels",
    stylers: [
      {
        lightness: 50,
      },
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry.fill",
    stylers: [
      {
        color: "#f5f3f3",
      },
    ],
  },
  {
    featureType: "landscape.natural.landcover",
    elementType: "geometry.fill",
    stylers: [
      {
        color: "#d3f8e2",
      },
    ],
  },
  {
    featureType: "landscape.natural.terrain",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "landscape.natural.terrain",
    elementType: "geometry.fill",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "landscape.natural.terrain",
    elementType: "labels.text",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "poi",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "poi.park",
    elementType: "geometry.fill",
    stylers: [
      {
        color: "#c2f2d5",
      },
      {
        visibility: "on",
      },
    ],
  },
  {
    featureType: "poi.school",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "poi.school",
    elementType: "geometry.fill",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "poi.school",
    elementType: "labels.icon",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "poi.school",
    elementType: "labels.text",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "road",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry.fill",
    stylers: [
      {
        color: "#d9e0e8",
      },
      {
        visibility: "on",
      },
    ],
  },
  {
    featureType: "road.arterial",
    elementType: "labels.icon",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "road.arterial",
    elementType: "labels.text",
    stylers: [
      {
        visibility: "on",
      },
    ],
  },
  {
    featureType: "transit",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "water",
    stylers: [
      {
        color: "#73d4e8",
      },
    ],
  },
  {
    featureType: "water",
    elementType: "geometry.fill",
    stylers: [
      {
        lightness: 35,
      },
    ],
  },
];
