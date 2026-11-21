import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";

export function Spinner({
  size = 13,
  color,
  label,
}: {
  size?: number;
  color: string;
  label?: string;
}) {
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 820,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn]);

  const rotate = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
        <Icon name="LoaderCircle" size={size} color={color} />
      </Animated.View>
    </View>
  );
}
