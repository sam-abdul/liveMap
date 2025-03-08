import "react-native-get-random-values";
import { NavigationContainer } from "@react-navigation/native"; // import NavigationContainer
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SearchScreen from "./pages/SearchScreen";


const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="SearchScreen"
          options={{ headerShown: false }}
          component={SearchScreen}

        />

      </Stack.Navigator>
    </NavigationContainer>
  );
}
