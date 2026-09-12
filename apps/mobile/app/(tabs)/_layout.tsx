import { useEffect, useRef } from "react";
import { Redirect, Tabs, type Href } from "expo-router";
import { View, Text, TouchableOpacity, Animated, Dimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useColorScheme } from "nativewind";

import { useAuthHydrated, useAuthStore } from "@/stores/auth-store";

/**
 * Custom Bottom Tab Bar - Floating Capsule with sliding animation
 * Giống 100% ảnh mockup 2 bạn cung cấp
 */
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width } = Dimensions.get("window");
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  
  // Chiều rộng tổng thể của viên thuốc Tab Bar
  const tabBarWidth = width - 48; // Cách 24px mỗi bên
  const padding = 8;
  const contentWidth = tabBarWidth - padding * 2;
  const tabWidth = contentWidth / 4;

  // Sử dụng Animated Value cho hiệu ứng trượt di chuyển qua lại
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: state.index * tabWidth,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, [state.index]);

  return (
    <View
      style={{
        position: "absolute",
        bottom: 24,
        left: 24,
        right: 24,
        height: 64,
        backgroundColor: isDark ? "#101A2B" : "#FFFFFF",
        borderRadius: 32,
        borderWidth: 1,
        borderColor: isDark ? "#26334A" : "#E2E8F0",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: padding,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.35 : 0.1,
        shadowRadius: 12,
        elevation: 8,
      }}
    >
      {/* Viên thuốc active màu xanh navy di chuyển 2 bên */}
      <Animated.View
        style={{
          position: "absolute",
          height: 48,
          width: tabWidth,
          backgroundColor: isDark ? "#1D4ED8" : "#09258A",
          borderRadius: 24,
          left: padding,
          transform: [{ translateX: slideAnim }],
        }}
      />

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        // Only `title` (a string) is set on each Tabs.Screen below, so read it
        // directly. `tabBarLabel` is skipped because its type allows a render
        // function, which cannot be passed as a <Text> child.
        const label = options.title ?? route.name;

        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        let iconName: any = "home";
        if (route.name === "index") {
          iconName = "home";
        } else if (route.name === "bookmarks") {
          iconName = "bookmark";
        } else if (route.name === "notifications") {
          iconName = "bell";
        } else if (route.name === "profile") {
          iconName = "user";
        }
        
        const inactiveColor = isDark ? "#94A3B8" : "#64748B";

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              height: 48,
            }}
            activeOpacity={0.8}
          >
            <Feather
              name={iconName}
              size={20}
              color={isFocused ? "#FFFFFF" : inactiveColor}
            />
            <Text
              style={{
                color: isFocused ? "#FFFFFF" : inactiveColor,
                fontSize: 10,
                fontWeight: "bold",
                marginTop: 2,
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const authHydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);

  if (!authHydrated) {
    return null;
  }

  if (!accessToken) {
    return <Redirect href={"/login" as Href} />;
  }

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          title: "Bookmarks",
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
        }}
      />
    </Tabs>
  );
}


