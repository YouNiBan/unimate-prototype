import React, { useContext, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable as NativePressable,
  Share,
  ScrollView as NativeScrollView,
  StatusBar,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  useWindowDimensions,
  View as NativeView,
} from "react-native";
import { Ionicons as NativeIonicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  SafeAreaProvider,
  SafeAreaView as NativeSafeAreaView,
} from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import QRCode from "react-native-qrcode-svg";

const DarkModeContext = React.createContext(false);

const darkBackgrounds: Record<string, string> = {
  "#FFFFFF": "#162338",
  WHITE: "#162338",
  "#F4F7FB": "#0B1423",
  "#F2F7FC": "#142237",
  "#F7FAFD": "#121F32",
  "#F8FBFE": "#121F32",
  "#F8FAFC": "#121F32",
  "#FBFDFF": "#121F32",
  "#F7FBFF": "#121F32",
  "#F8FBFF": "#121F32",
  "#F2F6FB": "#142237",
  "#F3F7FB": "#142237",
  "#F3F6F9": "#172438",
  "#EAF5FF": "#102C47",
  "#E8F4FF": "#102C47",
  "#DCEEFF": "#102C47",
  "#DCEBFF": "#102C47",
  "#EDF3FA": "#17283D",
  "#F2F8FE": "#132A43",
  "#F4FAFF": "#132A43",
  "#ECF9F2": "#123326",
  "#E9F8F0": "#123326",
  "#E8F8EF": "#123326",
  "#FFF0F1": "#351D27",
  "#FFF1F2": "#351D27",
  "#FFF4F5": "#351D27",
  "#FFF7F7": "#351D27",
  "#FFF5D9": "#382D16",
  "#FFF5E8": "#35291B",
  "#F7F2FF": "#281F3B",
  "#EEF2F6": "#1A2739",
  "#F2F5F8": "#1A2739",
  "#E7ECF2": "#1A2739",
  "#F5FAFF": "#132A43",
  "#F2F8FF": "#102C47",
  "#E3F1FF": "#173957",
};

const darkText: Record<string, string> = {
  "#08265F": "#F3F7FF",
  "#16213D": "#E9F0FA",
  "#71809B": "#A9B7CC",
  "#0878E6": "#5BB0FF",
  "#23B866": "#63D894",
  "#FF5360": "#FF7D88",
  "#6D3EEB": "#B096FF",
  "#7542C8": "#B89BFF",
  "#F28A18": "#FFC06B",
  "#B97A0D": "#F3C66B",
  "#B67A16": "#F3C66B",
  "#00A1A7": "#58D7DB",
  "#713CE0": "#B79DFF",
  "#2CB66D": "#70D99A",
  "#F2B94B": "#F5CA72",
  "#FF5A68": "#FF8792",
  "#397653": "#82D2A4",
  "#2878C8": "#78BFFF",
  "#8B4047": "#F3A1AA",
  "#A0AABB": "#8392A9",
};

const darkBorders: Record<string, string> = {
  "#FFFFFF": "#33445D",
  WHITE: "#33445D",
  "#E2EAF4": "#2D3D55",
  "#DEE6EF": "#304158",
  "#DCE8F3": "#30445E",
  "#D8E5F1": "#30445E",
  "#D9E3ED": "#30445E",
  "#DCE6F0": "#30445E",
  "#E1E6EC": "#304158",
  "#BDD9F5": "#315D83",
  "#BFD7ED": "#355879",
  "#CDE4F8": "#315D83",
  "#CFE3F8": "#315D83",
  "#F3CDD0": "#6A3843",
};

const parseThemeHex = (value: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const raw = match[1];
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
};

const darkFallbackColor = (
  value: string,
  role: "background" | "text" | "border",
) => {
  const rgb = parseThemeHex(value);
  if (!rgb) return value;
  const { r, g, b } = rgb;
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
  if (role === "background" && lightness > 0.78) {
    if (r > g + 18 && r > b + 18) return "#38202A";
    if (g > r + 15 && g > b + 10) return "#173326";
    if (b > r + 15) return "#142D47";
    if (r > 225 && g > 205 && b < 185) return "#382E18";
    return "#172438";
  }
  if (role === "border" && lightness > 0.58) return "#34465F";
  if (role === "text" && lightness < 0.52) {
    if (b > r * 1.25 && b > g * 1.08) return "#69B8FF";
    if (g > r * 1.18 && g > b * 1.05) return "#6FD79A";
    if (r > g * 1.2 && r > b * 1.15) return "#FF8D98";
    if (r > 120 && g > 80 && b < 70) return "#F3C66B";
    return "#E6EDF7";
  }
  return value;
};

const mapThemeColor = (
  value: unknown,
  map: Record<string, string>,
  role: "background" | "text" | "border",
) => {
  if (typeof value !== "string") return value;
  return map[value.toUpperCase()] || darkFallbackColor(value, role);
};

const themedStyle = (style: any, darkMode: boolean) => {
  if (!darkMode || !style) return style;
  const flat = StyleSheet.flatten(style);
  if (!flat || typeof flat !== "object") return style;
  const next: Record<string, unknown> = { ...flat };
  if (next.backgroundColor)
    next.backgroundColor = mapThemeColor(
      next.backgroundColor,
      darkBackgrounds,
      "background",
    );
  if (next.color)
    next.color = mapThemeColor(next.color, darkText, "text");
  if (next.borderColor)
    next.borderColor = mapThemeColor(next.borderColor, darkBorders, "border");
  if (next.borderTopColor)
    next.borderTopColor = mapThemeColor(
      next.borderTopColor,
      darkBorders,
      "border",
    );
  if (next.borderBottomColor)
    next.borderBottomColor = mapThemeColor(
      next.borderBottomColor,
      darkBorders,
      "border",
    );
  if (next.borderLeftColor)
    next.borderLeftColor = mapThemeColor(
      next.borderLeftColor,
      darkBorders,
      "border",
    );
  if (next.borderRightColor)
    next.borderRightColor = mapThemeColor(
      next.borderRightColor,
      darkBorders,
      "border",
    );
  return next;
};

function Ionicons(props: React.ComponentProps<typeof NativeIonicons>) {
  const darkMode = useContext(DarkModeContext);
  const color = darkMode
    ? mapThemeColor(props.color, darkText, "text")
    : props.color;
  return <NativeIonicons {...props} color={color as any} />;
}

function View(props: React.ComponentProps<typeof NativeView>) {
  const darkMode = useContext(DarkModeContext);
  return <NativeView {...props} style={themedStyle(props.style, darkMode)} />;
}

function Text(props: React.ComponentProps<typeof NativeText>) {
  const darkMode = useContext(DarkModeContext);
  return <NativeText {...props} style={themedStyle(props.style, darkMode)} />;
}

function TextInput(props: React.ComponentProps<typeof NativeTextInput>) {
  const darkMode = useContext(DarkModeContext);
  return (
    <NativeTextInput
      {...props}
      style={themedStyle(props.style, darkMode)}
      placeholderTextColor={darkMode ? "#8190A6" : props.placeholderTextColor}
      selectionColor={darkMode ? "#5BB0FF" : props.selectionColor}
    />
  );
}

const ScrollView = React.forwardRef<
  React.ElementRef<typeof NativeScrollView>,
  React.ComponentProps<typeof NativeScrollView>
>((props, ref) => {
  const darkMode = useContext(DarkModeContext);
  return (
    <NativeScrollView
      {...props}
      ref={ref}
      style={themedStyle(props.style, darkMode)}
      contentContainerStyle={themedStyle(props.contentContainerStyle, darkMode)}
    />
  );
});
ScrollView.displayName = "ThemedScrollView";

function Pressable(props: React.ComponentProps<typeof NativePressable>) {
  const darkMode = useContext(DarkModeContext);
  const sourceStyle = props.style;
  const style =
    typeof sourceStyle === "function"
      ? (state: any) => themedStyle(sourceStyle(state), darkMode)
      : themedStyle(sourceStyle, darkMode);
  return <NativePressable {...props} style={style as any} />;
}

function SafeAreaView(props: React.ComponentProps<typeof NativeSafeAreaView>) {
  const darkMode = useContext(DarkModeContext);
  return (
    <NativeSafeAreaView
      {...props}
      style={themedStyle(props.style, darkMode)}
    />
  );
}

type Tab =
  | "home"
  | "events"
  | "food"
  | "friends"
  | "bookings"
  | "messages"
  | "profile";
type Language = "EN" | "简体" | "繁體";

const tr = (
  language: Language,
  en: string,
  simplified: string,
  traditional = simplified,
) => (language === "EN" ? en : language === "简体" ? simplified : traditional);
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateFromKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const bookingDateFromToday = (daysAhead = 7) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysAhead);
  return dateKey(date);
};
const formatBookingDate = (value: string, language: Language) =>
  dateFromKey(value).toLocaleDateString(
    language === "EN" ? "en-GB" : language === "简体" ? "zh-CN" : "zh-TW",
    { day: "numeric", month: "long", year: "numeric" },
  );
const categoryLabel = (language: Language, category: string) =>
  ({
    All: tr(language, "All", "全部", "全部"),
    Sports: tr(language, "Sports", "体育", "體育"),
    Parties: tr(language, "Parties", "派对", "派對"),
    "House parties": tr(language, "House parties", "家庭派对", "家庭派對"),
    Culture: tr(language, "Culture", "文化", "文化"),
    Trips: tr(language, "Trips", "旅行", "旅行"),
    "Club events": tr(language, "Club events", "夜店活动", "夜店活動"),
    Other: tr(language, "Other", "其他", "其他"),
  })[category] || category;

type PhotoSource = "camera" | "library";
type PhotoPickerOptions = {
  multiple?: boolean;
  limit?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
};

async function selectPhotoUris(
  language: Language,
  source: PhotoSource,
  options: PhotoPickerOptions = {},
) {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      source === "camera"
        ? tr(
            language,
            "Camera access is required",
            "需要相机权限",
            "需要相機權限",
          )
        : tr(
            language,
            "Photo access is required",
            "需要照片访问权限",
            "需要相片存取權限",
          ),
      tr(
        language,
        "Allow access in your device settings, then try again.",
        "请在设备设置中允许权限后重试。",
        "請在裝置設定中允許權限後重試。",
      ),
    );
    return [];
  }
  const common = {
    mediaTypes: ["images"] as ImagePicker.MediaType[],
    quality: options.quality ?? 0.8,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          ...common,
          allowsEditing: options.allowsEditing ?? false,
          aspect: options.aspect,
        })
      : await ImagePicker.launchImageLibraryAsync({
          ...common,
          allowsEditing: options.allowsEditing ?? false,
          aspect: options.aspect,
          allowsMultipleSelection: options.multiple ?? false,
          selectionLimit: options.limit,
        });
  return result.canceled ? [] : result.assets.map((asset) => asset.uri);
}

function PhotoSourceActions({
  language,
  onCamera,
  onLibrary,
  compact = false,
}: {
  language: Language;
  onCamera: () => void;
  onLibrary: () => void;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.photoSourceActions,
        compact && styles.photoSourceActionsCompact,
      ]}
    >
      <Pressable
        accessibilityLabel={tr(
          language,
          "Take photo with camera",
          "使用相机拍照",
          "使用相機拍照",
        )}
        style={[
          styles.photoSourceButton,
          compact && styles.photoSourceButtonCompact,
        ]}
        onPress={onCamera}
      >
        <Ionicons
          name="camera-outline"
          size={compact ? 15 : 18}
          color={palette.blue}
        />
        <Text style={styles.photoSourceText}>
          {tr(language, "Camera", "相机", "相機")}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={tr(
          language,
          "Choose from photo library",
          "从照片库选择",
          "從相片庫選擇",
        )}
        style={[
          styles.photoSourceButton,
          compact && styles.photoSourceButtonCompact,
        ]}
        onPress={onLibrary}
      >
        <Ionicons
          name="images-outline"
          size={compact ? 15 : 18}
          color={palette.blue}
        />
        <Text style={styles.photoSourceText}>
          {tr(language, "Photo library", "照片库", "相片庫")}
        </Text>
      </Pressable>
    </View>
  );
}

function askPhotoSource(
  language: Language,
  onSelect: (source: PhotoSource) => void,
) {
  Alert.alert(
    tr(language, "Add a photo", "添加照片", "加入相片"),
    tr(
      language,
      "Take a new photo or choose one from your photo library.",
      "拍摄新照片，或从照片库中选择。",
      "拍攝新相片，或從相片庫中選擇。",
    ),
    [
      {
        text: tr(language, "Open camera", "打开相机", "開啟相機"),
        onPress: () => onSelect("camera"),
      },
      {
        text: tr(language, "Photo library", "照片库", "相片庫"),
        onPress: () => onSelect("library"),
      },
      { text: tr(language, "Cancel", "取消", "取消"), style: "cancel" },
    ],
  );
}

const palette = {
  navy: "#08265F",
  blue: "#0878E6",
  sky: "#EAF5FF",
  green: "#23B866",
  coral: "#FF5360",
  ink: "#16213D",
  muted: "#71809B",
  line: "#E2EAF4",
  white: "#FFFFFF",
};
const darkThemeCss = `.unimate-dark{color-scheme:dark}`;
const copy = {
  EN: {
    greeting: "Hello, welcome to the UK",
    tagline: "Your mate for student life.",
    search: "Search friends, events, services…",
    featured: "Featured events",
    see: "See all",
    heroTop: "NEW CITY.",
    heroTitle: "New friends, new adventures.",
    heroText: "Meet people and make the most of your UK journey.",
  },
  简体: {
    greeting: "你好，欢迎来到英国",
    tagline: "你的留学生活伙伴。",
    search: "搜索朋友、活动、服务…",
    featured: "热门活动",
    see: "查看全部",
    heroTop: "新城市。",
    heroTitle: "新朋友，新生活。",
    heroText: "认识伙伴，尽享你的英国留学生活。",
  },
  繁體: {
    greeting: "你好，歡迎來到英國",
    tagline: "你的留學生活夥伴。",
    search: "搜尋朋友、活動、服務…",
    featured: "熱門活動",
    see: "查看全部",
    heroTop: "新城市。",
    heroTitle: "新朋友，新生活。",
    heroText: "認識夥伴，盡享你的英國留學生活。",
  },
};

const words = {
  EN: {
    home: "Home",
    events: "Events",
    post: "Post event",
    food: "Places",
    profile: "Profile",
    bookings: "Bookings",
    messages: "Messages",
    airport: "Airport transfer",
    cleaning: "Cleaning",
    moving: "Student moving",
    friends: "Friends",
    market: "Marketplace",
    more: "More services",
    eventForum: "Find Events",
    eventSearch: "Search the event forum…",
    foodForum: "Restaurants & activities",
    foodSearch: "Search restaurants, activities or areas…",
    addReview: "Add review",
    book: "Book service",
    sell: "Sell an item",
    commission: "UNIMATE receives a 15% commission only when your item sells.",
  },
  简体: {
    home: "首页",
    events: "活动",
    post: "发布活动",
    food: "地点",
    profile: "我的",
    bookings: "订单",
    messages: "消息",
    airport: "机场接送",
    cleaning: "保洁服务",
    moving: "学生搬家",
    friends: "好友",
    market: "二手市场",
    more: "更多服务",
    eventForum: "寻找活动",
    eventSearch: "搜索活动…",
    foodForum: "餐厅与活动点评",
    foodSearch: "搜索餐厅、活动或地区…",
    addReview: "写点评",
    book: "预约服务",
    sell: "出售物品",
    commission: "物品成功售出后，UNIMATE 收取15%佣金。",
  },
  繁體: {
    home: "首頁",
    events: "活動",
    post: "發佈活動",
    food: "地點",
    profile: "我的",
    bookings: "訂單",
    messages: "訊息",
    airport: "機場接送",
    cleaning: "清潔服務",
    moving: "學生搬屋",
    friends: "好友",
    market: "二手市場",
    more: "更多服務",
    eventForum: "尋找活動",
    eventSearch: "搜尋活動…",
    foodForum: "餐廳與活動點評",
    foodSearch: "搜尋餐廳、活動或地區…",
    addReview: "寫點評",
    book: "預約服務",
    sell: "出售物品",
    commission: "物品成功售出後，UNIMATE 收取15%佣金。",
  },
};

const events = [
  {
    title: "Thames River Cruise",
    zh: "泰晤士河游船",
    date: "Sat, 12 Apr",
    time: "14:00–17:00",
    place: "London Eye Pier",
    price: "£25",
    age: "18+",
    lastEntry: "13:45",
    category: "Trips",
    tag: "Official event",
    going: 68,
    spotsLeft: 32,
    releaseAt: "18 September · 10:00",
    summary:
      "See London from the Thames and meet students from universities across the city.",
    image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=900",
  },
  {
    title: "Outdoor Movie Night",
    zh: "户外电影之夜",
    date: "Sat, 19 Apr",
    time: "19:30–22:30",
    place: "Regent’s Park",
    price: "Free",
    age: "18+",
    lastEntry: "20:00",
    category: "Culture",
    tag: "Student event",
    going: 86,
    spotsLeft: 14,
    releaseAt: "20 September · 18:00",
    summary:
      "Bring a blanket and enjoy a film under the stars with the international student community.",
    image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=900",
  },
  {
    title: "International Student Night",
    zh: "国际学生之夜",
    date: "Fri, 28 Mar",
    time: "22:00–03:00",
    place: "Central London",
    price: "£8",
    age: "18+",
    lastEntry: "23:30",
    category: "Club events",
    tag: "Sponsored",
    going: 120,
    spotsLeft: 0,
    releaseAt: "24 September · 12:00",
    summary:
      "A student club night with international DJs and discounted advance tickets.",
    image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900",
  },
];

const friends = [
  {
    username: "@londonlatte",
    fullName: "Emma Chen",
    uni: "UCL",
    course: "Media & Communications",
    interests: ["Photography", "Travel", "Good food", "K-dramas"],
    color: "#FFE0D1",
    initials: "LL",
    prompt: "My perfect London Sunday…",
    answer: "A slow brunch, a gallery, and finding the best matcha in town.",
    socials: ["WeChat", "Instagram", "RedNote"],
    socialVisible: true,
  },
  {
    username: "@danplays",
    fullName: "Daniel Wong",
    uni: "King’s College London",
    course: "Business Management",
    interests: ["Football", "Gym", "Music", "Gaming"],
    color: "#DCEBFF",
    initials: "DP",
    prompt: "We’ll get along if…",
    answer: "You are always up for a game, concert, or late-night food run.",
    socials: ["Instagram", "TikTok"],
    socialVisible: true,
  },
  {
    username: "@citylily",
    fullName: "Lily Zhang",
    uni: "LSE",
    course: "Economics",
    interests: ["Coffee", "Films", "City walks", "Food"],
    color: "#F7DAF5",
    initials: "CL",
    prompt: "Together we could…",
    answer: "Explore a different London neighbourhood every weekend.",
    socials: ["WeChat", "RedNote", "Douyin"],
    socialVisible: false,
  },
  {
    username: "@techhoops",
    fullName: "James Liu",
    uni: "Imperial College London",
    course: "Computing",
    interests: ["Technology", "Basketball", "Travel", "Anime"],
    color: "#DDF5E6",
    initials: "TH",
    prompt: "A fact about me…",
    answer:
      "I can build an app and miss an open three-pointer on the same day.",
    socials: ["Instagram", "Facebook"],
    socialVisible: true,
  },
];

const services = [
  { id: "events", icon: "calendar", color: "#FF4657" },
  { id: "airport", icon: "car-sport", color: "#17A957" },
  { id: "cleaning", icon: "home", color: "#F28A18" },
  { id: "moving", icon: "cube", color: "#00A1A7" },
  { id: "market", icon: "bag-handle", color: "#713CE0" },
  { id: "food", icon: "restaurant", color: "#E95E32" },
];

const dashboardLabels = {
  EN: {
    friends: "Make Friends",
    events: "Discover Events",
    airport: "Airport Transfers",
    cleaning: "Cleaning Services",
    moving: "Student Moves",
    market: "Student Marketplace",
    food: "Places & Reviews",
  },
  简体: {
    friends: "认识朋友",
    events: "发现活动",
    airport: "机场接送",
    cleaning: "保洁服务",
    moving: "学生搬家",
    market: "学生二手市场",
    food: "地点与点评",
  },
  繁體: {
    friends: "認識朋友",
    events: "探索活動",
    airport: "機場接送",
    cleaning: "清潔服務",
    moving: "學生搬屋",
    market: "學生二手市場",
    food: "地點與點評",
  },
};

const restaurants = [
  {
    name: "Haidilao Hot Pot",
    area: "Piccadilly Circus",
    distance: "0.7 mi",
    rating: "4.8",
    friendScore: "4.9",
    reviews: "248",
    category: "Chinese",
    occasion: "Friends",
    dish: "Tomato hot pot · 番茄火锅",
    price: "££",
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=900",
    quote: "Perfect for a group dinner. Brilliant service and lots of choice.",
    translation: "非常适合朋友聚餐，服务周到，选择也很多。",
  },
  {
    name: "Dishoom",
    area: "Covent Garden",
    distance: "1.1 mi",
    rating: "4.7",
    friendScore: "4.8",
    reviews: "531",
    category: "Indian",
    occasion: "Date night",
    dish: "Black daal · Bacon naan",
    price: "££",
    image: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?w=900",
    quote:
      "The black daal is worth the queue. Great atmosphere for visiting friends.",
    translation: "黑扁豆咖喱值得排队，气氛也很适合朋友聚餐。",
  },
  {
    name: "Four Seasons",
    area: "Chinatown",
    distance: "0.9 mi",
    rating: "4.6",
    friendScore: "4.7",
    reviews: "186",
    category: "Chinese",
    occasion: "Family",
    dish: "Roast duck · 烧鸭",
    price: "££",
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=900",
    quote: "Reliable Cantonese comfort food in central London.",
    translation: "在伦敦市中心也能吃到稳定又亲切的粤式味道。",
  },
  {
    name: "Napoli Corner",
    area: "Soho",
    distance: "1.3 mi",
    rating: "4.5",
    friendScore: "4.6",
    reviews: "122",
    category: "Italian",
    occasion: "Date night",
    dish: "Truffle tagliatelle",
    price: "££",
    image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=900",
    quote: "Cosy, relaxed and easy to share. The pasta portions are generous.",
    translation: "环境温馨轻松，很适合分享，意面分量也很足。",
  },
  {
    name: "Seoul Yard",
    area: "Fitzrovia",
    distance: "1.5 mi",
    rating: "4.6",
    friendScore: "4.7",
    reviews: "164",
    category: "Korean",
    occasion: "Birthday",
    dish: "Korean BBQ set",
    price: "££",
    image: "https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=900",
    quote:
      "Lively tables, helpful staff and a great birthday option for a group.",
    translation: "气氛热闹、员工贴心，很适合朋友一起庆祝生日。",
  },
  {
    name: "Campus Burger Co.",
    area: "Bloomsbury",
    distance: "0.4 mi",
    rating: "4.3",
    friendScore: "4.5",
    reviews: "97",
    category: "Burger",
    occasion: "Under £20",
    dish: "Smash burger meal",
    price: "£",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900",
    quote: "Fast, filling and genuinely affordable between lectures.",
    translation: "上课间隙来一份很方便，分量足，价格也很学生友好。",
  },
  {
    name: "Clay & Chai Studio",
    area: "Camden",
    distance: "2.2 mi",
    rating: "4.9",
    friendScore: "4.9",
    reviews: "76",
    category: "Activity",
    occasion: "Friends",
    dish: "Social pottery class · Tea included",
    price: "££",
    image: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=900",
    quote:
      "A friendly beginner session with enough time to chat and make something useful.",
    translation: "很适合新手，既能聊天认识朋友，也能亲手做出实用的小作品。",
  },
];

const products = [
  {
    name: "Air fryer",
    price: "£25",
    condition: "Like new",
    category: "Kitchen",
    image: "https://images.unsplash.com/photo-1585515320310-259814833e62?w=500",
  },
  {
    name: "Electric kettle",
    price: "£10",
    condition: "Used",
    category: "Kitchen",
    image: "https://images.unsplash.com/photo-1594213114663-d94db9b17125?w=500",
  },
  {
    name: "Desk chair",
    price: "£20",
    condition: "Minor damage",
    category: "Furniture",
    image: "https://images.unsplash.com/photo-1503602642458-232111445657?w=900",
  },
  {
    name: "Study lamp",
    price: "£8",
    condition: "Like new",
    category: "Daily needs",
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=500",
  },
  {
    name: "Rice cooker",
    price: "£18",
    condition: "Opened — never used",
    category: "Kitchen",
    image: "https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=500",
  },
  {
    name: "Kitchen starter set",
    price: "£15",
    condition: "Used",
    category: "Kitchen",
    image: "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=500",
  },
  {
    name: "Bluetooth speaker",
    price: "£16",
    condition: "Used",
    category: "Electronics",
    image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=500",
  },
  {
    name: "Bedside table",
    price: "£12",
    condition: "Used",
    category: "Furniture",
    image: "https://images.unsplash.com/photo-1532323544230-7191fd51bc1b?w=500",
  },
  {
    name: "Plates & cutlery set",
    price: "£9",
    condition: "Like new",
    category: "Kitchen",
    image: "https://images.unsplash.com/photo-1603199506016-b9a594b593c0?w=500",
  },
  {
    name: "Hair clip set",
    price: "£4",
    condition: "Opened — never used",
    category: "Accessories",
    image: "https://images.unsplash.com/photo-1590156206657-a1a5b7b3d18b?w=500",
  },
  {
    name: "Course textbook bundle",
    price: "£12",
    condition: "Used",
    category: "Books",
    image: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500",
  },
  {
    name: "Folding clothes airer",
    price: "£10",
    condition: "Used",
    category: "Homeware",
    image: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=500",
  },
];

function Header({
  language,
  onLanguage,
  location,
  onLocation,
  onNotifications,
  onHome,
  unreadCount,
  darkMode,
  onToggleTheme,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  location: string;
  onLocation: () => void;
  onNotifications: () => void;
  onHome: () => void;
  unreadCount: number;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  const [languageOpen, setLanguageOpen] = useState(false);
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const locationLabel =
    location === "London"
      ? language === "EN"
        ? "London"
        : language === "简体"
          ? "伦敦"
          : "倫敦"
      : location;
  const languageNames: Record<Language, string> = {
    EN: "English",
    简体: "简体中文",
    繁體: "繁體中文",
  };
  return (
    <View
      style={[
        styles.header,
        compact && styles.headerCompact,
        darkMode && styles.darkHeader,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr(language, "Go to Home", "返回首页", "返回首頁")}
        onPress={onHome}
      >
        <View
          style={[
            styles.brandLogoFrame,
            compact && styles.brandLogoFrameCompact,
          ]}
        >
          <Image
            source={require("./assets/unimate-logo.png")}
            style={[
              styles.brandLogo,
              compact && styles.brandLogoCompact,
              darkMode && styles.brandLogoDark,
            ]}
            resizeMode="contain"
          />
          {darkMode && (
            <View
              style={[
                styles.brandLogoMarkClip,
                compact && styles.brandLogoMarkClipCompact,
              ]}
            >
              <Image
                source={require("./assets/unimate-logo.png")}
                style={[
                  styles.brandLogoMark,
                  compact && styles.brandLogoMarkCompact,
                ]}
                resizeMode="contain"
              />
            </View>
          )}
        </View>
      </Pressable>
      <View
        style={[styles.headerControls, compact && styles.headerControlsCompact]}
      >
        <Pressable
          accessibilityLabel={
            darkMode
              ? tr(language, "Use light mode", "使用浅色模式", "使用淺色模式")
              : tr(language, "Use dark mode", "使用深色模式", "使用深色模式")
          }
          style={[
            styles.headerIconButton,
            compact && styles.headerIconButtonCompact,
          ]}
          onPress={onToggleTheme}
        >
          <Ionicons
            name={darkMode ? "sunny-outline" : "moon-outline"}
            size={compact ? 18 : 20}
            color={darkMode ? "#FFD166" : palette.navy}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Notifications"
          style={[
            styles.headerIconButton,
            compact && styles.headerIconButtonCompact,
          ]}
          onPress={onNotifications}
        >
          <Ionicons
            name="notifications-outline"
            size={compact ? 18 : 20}
            color={palette.navy}
          />
          {unreadCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          accessibilityLabel={`Location: ${locationLabel}`}
          style={[
            styles.headerIconButton,
            compact && styles.headerIconButtonCompact,
          ]}
          onPress={onLocation}
        >
          <Ionicons
            name="location-outline"
            size={compact ? 18 : 20}
            color={palette.navy}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={`Language: ${languageNames[language]}`}
          style={[
            styles.languageIconButton,
            compact && styles.languageIconButtonCompact,
          ]}
          onPress={() => setLanguageOpen(!languageOpen)}
        >
          <Ionicons
            name="globe-outline"
            size={compact ? 18 : 20}
            color={palette.navy}
          />
          <Text style={styles.languageCompact}>{language}</Text>
          <Ionicons
            name={languageOpen ? "chevron-up" : "chevron-down"}
            size={11}
            color={palette.blue}
          />
        </Pressable>
      </View>
      {languageOpen && (
        <View style={styles.languageMenu}>
          {(["EN", "简体", "繁體"] as Language[]).map((item) => (
            <Pressable
              key={item}
              style={[
                styles.languageOption,
                language === item && styles.languageOptionActive,
              ]}
              onPress={() => {
                onLanguage(item);
                setLanguageOpen(false);
              }}
            >
              <Text style={styles.languageCode}>{item}</Text>
              <Text
                style={[
                  styles.languageName,
                  language === item && styles.languageNameActive,
                ]}
              >
                {languageNames[item]}
              </Text>
              {language === item && (
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={palette.blue}
                />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function Search({ placeholder }: { placeholder: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={palette.muted} />
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor="#8B98AD"
      />
    </View>
  );
}

const londonUniversities = [
  "University College London",
  "King’s College London",
  "Imperial College London",
  "London School of Economics and Political Science",
  "Queen Mary University of London",
  "City St George’s, University of London",
  "SOAS University of London",
  "Birkbeck, University of London",
  "Goldsmiths, University of London",
  "University of the Arts London",
  "University of Greenwich",
  "University of Westminster",
  "London South Bank University",
  "University of East London",
  "London Metropolitan University",
  "Middlesex University London",
  "Brunel University London",
  "Kingston University London",
  "University of Roehampton",
  "University of West London",
  "St Mary’s University, Twickenham",
  "Royal College of Art",
  "Royal College of Music",
  "Royal Academy of Music",
  "Guildhall School of Music & Drama",
  "Royal Central School of Speech and Drama",
  "Trinity Laban Conservatoire of Music and Dance",
  "The Courtauld Institute of Art",
  "London Business School",
  "London School of Hygiene & Tropical Medicine",
  "Royal Veterinary College",
  "The Institute of Cancer Research",
  "Ravensbourne University London",
  "Regent’s University London",
  "BIMM University London",
  "The University of Law – London",
  "University of London Worldwide",
  "Richmond American University London",
  "Northeastern University London",
  "TEDI-London",
];

function SearchableUniversityField({
  language,
  value,
  onChange,
}: {
  language: Language;
  value: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const matches = londonUniversities
    .filter((item) => item.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8);
  return (
    <View style={styles.universitySearchWrap}>
      <Text style={styles.fieldLabel}>
        {tr(language, "University", "就读大学", "就讀大學")}
      </Text>
      <View
        style={[
          styles.universitySearchField,
          open && styles.universitySearchFieldActive,
        ]}
      >
        <Ionicons name="search-outline" size={18} color={palette.blue} />
        <TextInput
          style={styles.universitySearchInput}
          value={query}
          onFocus={() => setOpen(true)}
          onChangeText={(text) => {
            setQuery(text);
            setOpen(true);
          }}
          placeholder={tr(
            language,
            "Search London universities…",
            "搜索伦敦大学…",
            "搜尋倫敦大學…",
          )}
          placeholderTextColor="#9AA8BB"
        />
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={17}
          color={palette.blue}
        />
      </View>
      {open && (
        <View style={styles.universitySuggestions}>
          {matches.length ? (
            matches.map((item) => (
              <Pressable
                key={item}
                style={[
                  styles.universitySuggestion,
                  item === value && styles.universitySuggestionSelected,
                ]}
                onPress={() => {
                  onChange(item);
                  setQuery(item);
                  setOpen(false);
                }}
              >
                <View style={styles.universitySuggestionIcon}>
                  <Ionicons
                    name="school-outline"
                    size={17}
                    color={palette.blue}
                  />
                </View>
                <Text style={styles.universitySuggestionText}>{item}</Text>
                {item === value && (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={palette.green}
                  />
                )}
              </Pressable>
            ))
          ) : (
            <View style={styles.universityEmpty}>
              <Text style={styles.universityEmptyText}>
                {tr(
                  language,
                  "No matching London university. Check the spelling or contact support.",
                  "未找到匹配的伦敦大学，请检查拼写或联系客服。",
                  "未找到匹配的倫敦大學，請檢查拼寫或聯絡客服。",
                )}
              </Text>
            </View>
          )}
        </View>
      )}
      <Text style={styles.fieldHint}>
        {tr(
          language,
          "Search by university name and choose the official result.",
          "输入大学名称并选择官方结果。",
          "輸入大學名稱並選擇官方結果。",
        )}
      </Text>
    </View>
  );
}

function EventCard({
  event,
  language,
  onOpen,
  favourite = false,
  onToggleFavourite,
  recommendationReason,
}: {
  event: (typeof events)[number];
  language: Language;
  onOpen?: () => void;
  favourite?: boolean;
  onToggleFavourite?: () => void;
  recommendationReason?: string;
}) {
  const position = events.findIndex((item) => item.title === event.title);
  const traditionalTitles = ["泰晤士河遊船", "戶外電影之夜", "國際學生之夜"];
  const dates =
    language === "EN"
      ? event.date
      : language === "简体"
        ? ["4月12日，周六", "4月19日，周六", "3月28日，周五"][position]
        : ["4月12日，週六", "4月19日，週六", "3月28日，週五"][position];
  const places =
    language === "EN"
      ? event.place
      : language === "简体"
        ? ["伦敦眼码头", "摄政公园", "伦敦市中心"][position]
        : ["倫敦眼碼頭", "攝政公園", "倫敦市中心"][position];
  const tags =
    language === "EN"
      ? event.tag
      : language === "简体"
        ? ["官方活动", "学生活动", "推广活动"][position]
        : ["官方活動", "學生活動", "推廣活動"][position];
  const price =
    event.price === "Free"
      ? language === "EN"
        ? "Free"
        : language === "简体"
          ? "免费"
          : "免費"
      : event.price;
  const title =
    language === "EN"
      ? event.title
      : language === "简体"
        ? event.zh
        : traditionalTitles[position];
  const soldOut = event.spotsLeft === 0;
  return (
    <Pressable
      style={styles.eventCard}
      onPress={
        onOpen || (() => Alert.alert(title, `${dates} · ${places}\n${price}`))
      }
    >
      <Image source={{ uri: event.image }} style={styles.eventImage} />
      <View style={styles.eventTag}>
        <Text style={styles.eventTagText}>{tags}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          favourite
            ? tr(language, "Remove from favourites", "取消收藏", "取消收藏")
            : tr(language, "Add to favourites", "添加到收藏", "加入收藏")
        }
        style={[styles.heart, favourite && styles.heartFavourite]}
        onPress={(eventPress) => {
          eventPress.stopPropagation?.();
          onToggleFavourite?.();
        }}
      >
        <Ionicons
          name={favourite ? "heart" : "heart-outline"}
          size={22}
          color="white"
        />
      </Pressable>
      <View style={styles.eventBody}>
        {recommendationReason && (
          <View style={styles.eventRecommendation}>
            <Ionicons name="sparkles" size={14} color={palette.blue} />
            <Text style={styles.eventRecommendationText}>{recommendationReason}</Text>
          </View>
        )}
        <View style={styles.eventTitleLine}>
          <Text style={styles.eventTitle}>{title}</Text>
          <Text style={styles.categoryBadge}>
            {categoryLabel(language, event.category)}
          </Text>
        </View>
        <View style={styles.eventFacts}>
          <View style={styles.eventFact}>
            <Ionicons name="calendar-outline" size={15} color={palette.blue} />
            <View>
              <Text style={styles.eventFactLabel}>
                {tr(language, "Date", "日期", "日期")}
              </Text>
              <Text style={styles.eventFactValue}>{dates}</Text>
            </View>
          </View>
          <View style={styles.eventFact}>
            <Ionicons name="time-outline" size={15} color={palette.blue} />
            <View>
              <Text style={styles.eventFactLabel}>
                {tr(language, "Time", "时间", "時間")}
              </Text>
              <Text style={styles.eventFactValue}>{event.time}</Text>
            </View>
          </View>
          <View style={styles.eventFact}>
            <Ionicons name="enter-outline" size={15} color={palette.blue} />
            <View>
              <Text style={styles.eventFactLabel}>
                {tr(language, "Last entry", "最晚入场", "最晚入場")}
              </Text>
              <Text style={styles.eventFactValue}>{event.lastEntry}</Text>
            </View>
          </View>
          <View style={styles.eventFact}>
            <Ionicons name="location-outline" size={15} color={palette.blue} />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventFactLabel}>
                {tr(language, "Location", "地点", "地點")}
              </Text>
              <Text style={styles.eventFactValue} numberOfLines={1}>
                {places}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.eventReleaseCard}>
          <Ionicons
            name={soldOut ? "alarm-outline" : "calendar-clear-outline"}
            size={17}
            color={soldOut ? "#B97A0D" : palette.blue}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.eventReleaseTitle}>
              {soldOut
                ? tr(language, "Next ticket release", "下一次放票", "下一次放票")
                : event.price === "Free"
                  ? tr(language, "Spot reservations opened", "名额已开放", "名額已開放")
                  : tr(language, "Tickets went on sale", "门票已开售", "門票已開售")}
            </Text>
            <Text style={styles.eventReleaseText}>{event.releaseAt}</Text>
          </View>
          {soldOut && <Text style={styles.eventReleaseReminder}>{tr(language, "Set reminder", "设置提醒", "設定提醒")}</Text>}
        </View>
        <View style={styles.eventAttendance}>
          <View style={styles.eventAttendanceItem}>
            <Ionicons name="people-outline" size={18} color={palette.blue} />
            <View>
              <Text style={styles.eventAttendanceValue}>{event.going}</Text>
              <Text style={styles.eventAttendanceLabel}>
                {tr(language, "Going", "人参加", "人參加")}
              </Text>
            </View>
          </View>
          <View style={styles.eventAttendanceDivider} />
          <View style={styles.eventAttendanceItem}>
            <Ionicons
              name={soldOut ? "close-circle" : "ticket-outline"}
              size={18}
              color={soldOut ? palette.coral : palette.blue}
            />
            <View>
              <Text
                style={[
                  styles.eventAttendanceValue,
                  soldOut && { color: palette.coral },
                ]}
              >
                {soldOut
                  ? tr(language, "Sold out", "已售罄", "已售罄")
                  : event.spotsLeft}
              </Text>
              {!soldOut && (
                <Text style={styles.eventAttendanceLabel}>
                  {tr(language, "Spots left", "个名额", "個名額")}
                </Text>
              )}
            </View>
          </View>
        </View>
        <View style={styles.eventFooter}>
          <Text style={styles.price}>{price}</Text>
          {event.price === "Free" && !soldOut ? (
            <Pressable
              style={styles.confirmGoingButton}
              onPress={() =>
                Alert.alert(
                  tr(language, "You are going", "已确认参加", "已確認參加"),
                  tr(
                    language,
                    "Your place is confirmed and you have been added automatically to the event group chat in Messages.",
                    "名额已确认，你也已自动加入“消息”中的活动群聊。",
                    "名額已確認，你亦已自動加入「訊息」中的活動群聊。",
                  ),
                )
              }
            >
              <Ionicons name="checkmark-circle" size={16} color="white" />
              <Text style={styles.confirmGoingText}>
                {tr(language, "Reserve my place", "预留名额", "預留名額")}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.viewEventHint}>
              <Text style={styles.viewEventHintText}>
                {tr(language, "View event", "查看活动", "查看活動")}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={palette.blue} />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function StudentVerificationSheet({
  visible,
  language,
  onClose,
}: {
  visible: boolean;
  language: Language;
  onClose: () => void;
}) {
  const [applyMode, setApplyMode] = useState(false);
  const [university, setUniversity] = useState("University College London");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [selfie, setSelfie] = useState("");
  const pickVerificationPhoto = async (
    type: "id" | "selfie",
    source?: PhotoSource,
  ) => {
    if (!source) {
      askPhotoSource(language, (selectedSource) =>
        pickVerificationPhoto(type, selectedSource),
      );
      return;
    }
    const uris = await selectPhotoUris(language, source, {
      allowsEditing: true,
    });
    if (uris[0]) type === "id" ? setStudentId(uris[0]) : setSelfie(uris[0]);
  };
  const ready = university && email.includes("@") && studentId && selfie;
  return (
    <Sheet
      visible={visible}
      title={tr(language, "Student verification", "学生认证", "學生認證")}
      onClose={onClose}
    >
      <ScrollView
        contentContainerStyle={styles.verificationBody}
        showsVerticalScrollIndicator={false}
      >
        {!applyMode ? (
          <>
            <View style={styles.verificationHero}>
              <View style={styles.verificationTick}>
                <Ionicons name="checkmark" size={31} color="white" />
              </View>
              <Text style={styles.verificationTitle}>
                {tr(language, "Student verified", "学生已认证", "學生已認證")}
              </Text>
              <Text style={styles.verificationText}>
                {tr(
                  language,
                  "Your identity and current university enrolment have been checked. The green tick helps the community know this is a genuine student account.",
                  "你的身份及当前大学在读状态已完成核验。绿色认证标记帮助社区确认这是真实学生账号。",
                  "你的身份及目前大學在讀狀態已完成核驗。綠色認證標記幫助社群確認這是真實學生帳號。",
                )}
              </Text>
            </View>
            <View style={styles.verificationChecks}>
              {[
                {
                  icon: "school-outline",
                  title: university,
                  detail: tr(
                    language,
                    "University confirmed",
                    "大学信息已确认",
                    "大學資料已確認",
                  ),
                },
                {
                  icon: "card-outline",
                  title: tr(
                    language,
                    "Student ID checked",
                    "学生证已核验",
                    "學生證已核驗",
                  ),
                  detail: tr(
                    language,
                    "Expiry and name matched",
                    "有效期及姓名一致",
                    "有效期及姓名一致",
                  ),
                },
                {
                  icon: "mail-outline",
                  title: tr(
                    language,
                    "University email confirmed",
                    "大学邮箱已确认",
                    "大學電郵已確認",
                  ),
                  detail: "s•••••@ucl.ac.uk",
                },
                {
                  icon: "scan-outline",
                  title: tr(
                    language,
                    "Face match completed",
                    "人脸核验已完成",
                    "人臉核驗已完成",
                  ),
                  detail: tr(
                    language,
                    "Private biometric check passed",
                    "私密生物识别核验已通过",
                    "私密生物識別核驗已通過",
                  ),
                },
              ].map((item) => (
                <View style={styles.verificationCheck} key={item.title}>
                  <View style={styles.verificationCheckIcon}>
                    <Ionicons
                      name={item.icon as any}
                      size={20}
                      color={palette.green}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.supportOptionTitle}>{item.title}</Text>
                    <Text style={styles.supportOptionText}>{item.detail}</Text>
                  </View>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={palette.green}
                  />
                </View>
              ))}
            </View>
            <View style={styles.verificationPrivacy}>
              <Ionicons name="lock-closed" size={19} color={palette.blue} />
              <Text style={styles.verificationPrivacyText}>
                {tr(
                  language,
                  "Student ID and face-check images are private verification materials and are never shown on your public profile.",
                  "学生证及人脸核验图片属于私密认证材料，不会显示在公开个人资料中。",
                  "學生證及人臉核驗圖片屬於私密認證材料，不會顯示在公開個人資料中。",
                )}
              </Text>
            </View>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setApplyMode(true)}
            >
              <Text style={styles.secondaryButtonText}>
                {tr(
                  language,
                  "View verification process",
                  "查看认证流程",
                  "查看認證流程",
                )}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.verificationStepIntro}>
              <Text style={styles.formTitle}>
                {tr(
                  language,
                  "For new or unverified accounts",
                  "适用于新账号或未认证账号",
                  "適用於新帳號或未認證帳號",
                )}
              </Text>
              <Text style={styles.formDesc}>
                {tr(
                  language,
                  "Complete every step. An admin reviews the evidence before the verified tick appears.",
                  "请完成所有步骤。管理员审核材料后才会显示认证标记。",
                  "請完成所有步驟。管理員審核材料後才會顯示認證標記。",
                )}
              </Text>
            </View>
            <SearchableUniversityField
              language={language}
              value={university}
              onChange={setUniversity}
            />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                {tr(language, "University email", "大学邮箱", "大學電郵")}
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="name@university.ac.uk"
                placeholderTextColor="#A1ADBE"
              />
            </View>
            <View style={styles.verificationUploadRow}>
              <View
                style={[
                  styles.verificationUpload,
                  studentId && styles.verificationUploadDone,
                ]}
              >
                {studentId ? (
                  <Image
                    source={{ uri: studentId }}
                    style={styles.verificationUploadImage}
                  />
                ) : (
                  <Ionicons
                    name="card-outline"
                    size={28}
                    color={palette.blue}
                  />
                )}
                <Text style={styles.verificationUploadTitle}>
                  {tr(language, "Student ID", "学生证", "學生證")}
                </Text>
                <Text style={styles.verificationUploadMeta}>
                  {studentId
                    ? tr(language, "Added", "已添加", "已加入")
                    : tr(language, "Upload front", "上传正面", "上載正面")}
                </Text>
                <PhotoSourceActions
                  compact
                  language={language}
                  onCamera={() => pickVerificationPhoto("id", "camera")}
                  onLibrary={() => pickVerificationPhoto("id", "library")}
                />
              </View>
              <View
                style={[
                  styles.verificationUpload,
                  selfie && styles.verificationUploadDone,
                ]}
              >
                {selfie ? (
                  <Image
                    source={{ uri: selfie }}
                    style={styles.verificationUploadImage}
                  />
                ) : (
                  <Ionicons
                    name="scan-outline"
                    size={28}
                    color={palette.blue}
                  />
                )}
                <Text style={styles.verificationUploadTitle}>
                  {tr(language, "Face verification", "人脸核验", "人臉核驗")}
                </Text>
                <Text style={styles.verificationUploadMeta}>
                  {selfie
                    ? tr(language, "Added", "已添加", "已加入")
                    : tr(
                        language,
                        "Add clear selfie",
                        "添加清晰自拍",
                        "加入清晰自拍",
                      )}
                </Text>
                <PhotoSourceActions
                  compact
                  language={language}
                  onCamera={() => pickVerificationPhoto("selfie", "camera")}
                  onLibrary={() => pickVerificationPhoto("selfie", "library")}
                />
              </View>
            </View>
            <View style={styles.verificationPrivacy}>
              <Ionicons
                name="shield-checkmark"
                size={19}
                color={palette.green}
              />
              <Text style={styles.verificationPrivacyText}>
                {tr(
                  language,
                  "UNIMATE checks the university, document validity and face match. Failed or unclear checks require a manual review.",
                  "UNIMATE会核验大学、证件有效性及人脸一致性。失败或不清晰的材料将进入人工审核。",
                  "UNIMATE會核驗大學、證件有效性及人臉一致性。失敗或不清晰的材料將進入人工審核。",
                )}
              </Text>
            </View>
            <Pressable
              disabled={!ready}
              style={[styles.primaryButton, !ready && { opacity: 0.45 }]}
              onPress={() =>
                Alert.alert(
                  tr(
                    language,
                    "Verification submitted",
                    "认证已提交",
                    "認證已提交",
                  ),
                  tr(
                    language,
                    "Your badge remains unverified until the admin review is complete.",
                    "管理员审核完成前，账号将保持未认证状态。",
                    "管理員審核完成前，帳號將維持未認證狀態。",
                  ),
                )
              }
            >
              <Text style={styles.primaryButtonText}>
                {tr(
                  language,
                  "Submit for verification",
                  "提交认证",
                  "提交認證",
                )}
              </Text>
            </Pressable>
            <Pressable
              style={styles.backToStatus}
              onPress={() => setApplyMode(false)}
            >
              <Text style={styles.backToStatusText}>
                {tr(
                  language,
                  "Back to verification status",
                  "返回认证状态",
                  "返回認證狀態",
                )}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

function Home({
  language,
  setTab,
  openService,
  openFriends,
  openEvent,
  favourites,
  onToggleFavourite,
}: {
  language: Language;
  setTab: (tab: Tab) => void;
  openService: (service: "airport" | "cleaning" | "moving" | "market") => void;
  openFriends: () => void;
  openEvent: (eventTitle: string) => void;
  favourites: string[];
  onToggleFavourite: (eventTitle: string) => void;
}) {
  const t = copy[language];
  const [verificationOpen, setVerificationOpen] = useState(false);
  const homeServices = services;
  const serviceHints: Record<string, string> = {
    events: tr(language, "Events near you", "发现附近活动", "探索附近活動"),
    airport: tr(language, "Reliable pickups", "可靠接送服务", "可靠接送服務"),
    cleaning: tr(language, "Approved cleaners", "认证保洁人员", "認證清潔人員"),
    moving: tr(language, "Quotes made simple", "轻松获取报价", "輕鬆獲取報價"),
    market: tr(
      language,
      "Affordable essentials",
      "实惠学生用品",
      "實惠學生用品",
    ),
    food: tr(
      language,
      "Restaurants & activities",
      "餐厅与活动点评",
      "餐廳與活動點評",
    ),
    friends: tr(
      language,
      "Meet your community",
      "认识校园伙伴",
      "認識校園夥伴",
    ),
  };
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.homeGreetingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.homeEyebrow}>
            {tr(language, "MONDAY · LONDON", "周一 · 伦敦", "週一 · 倫敦")}
          </Text>
          <Text style={styles.welcome}>{t.greeting}</Text>
          <Text style={styles.subtitle}>{t.tagline}</Text>
        </View>
        <Pressable
          style={styles.studentBadge}
          onPress={() => setVerificationOpen(true)}
        >
          <Ionicons name="checkmark-circle" size={16} color={palette.green} />
          <Text style={styles.studentBadgeText}>
            {tr(language, "Student verified", "学生已认证", "學生已認證")}
          </Text>
        </Pressable>
      </View>
      <Search placeholder={t.search} />
      <LinearGradient colors={["#0878E6", "#1BA8EC"]} style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>{t.heroTop}</Text>
          <Text style={styles.heroTitle}>{t.heroTitle}</Text>
          <Text style={styles.heroText}>{t.heroText}</Text>
          <Pressable style={styles.heroButton} onPress={() => setTab("events")}>
            <Text style={styles.heroButtonText}>
              {tr(
                language,
                "Explore what’s on",
                "探索近期活动",
                "探索近期活動",
              )}
            </Text>
            <Ionicons name="arrow-forward" size={15} color={palette.blue} />
          </Pressable>
        </View>
        <View style={styles.heroArt}>
          <Ionicons name="business" size={82} color="rgba(255,255,255,.22)" />
        </View>
      </LinearGradient>
      <View style={styles.homeStatusRow}>
        <Pressable
          style={styles.homeStatusCard}
          onPress={() => setTab("bookings")}
        >
          <View style={[styles.homeStatusIcon, { backgroundColor: "#E8F4FF" }]}>
            <Ionicons name="ticket-outline" size={19} color={palette.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.homeStatusLabel}>
              {tr(language, "Next booking", "下一项预订", "下一項預訂")}
            </Text>
            <Text style={styles.homeStatusValue}>
              {tr(
                language,
                "River Cruise · Sat 14:00",
                "泰晤士河游船 · 周六14:00",
                "泰晤士河遊船 · 週六14:00",
              )}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={palette.muted} />
        </Pressable>
        <Pressable style={styles.homeStatusCard} onPress={openFriends}>
          <View style={[styles.homeStatusIcon, { backgroundColor: "#ECF9F2" }]}>
            <Ionicons
              name="person-add-outline"
              size={19}
              color={palette.green}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.homeStatusLabel}>
              {tr(language, "Friend requests", "好友请求", "好友請求")}
            </Text>
            <Text style={styles.homeStatusValue}>
              2 {tr(language, "waiting", "条待处理", "項待處理")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={palette.muted} />
        </Pressable>
      </View>
      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>
            {tr(
              language,
              "What do you need today?",
              "今天需要什么帮助？",
              "今天需要甚麼協助？",
            )}
          </Text>
          <Text style={styles.foodSectionHint}>
            {tr(
              language,
              "Trusted student services in one place",
              "值得信赖的学生服务都在这里",
              "值得信賴的學生服務都在這裡",
            )}
          </Text>
        </View>
      </View>
      <View style={styles.serviceGrid}>
        {homeServices.map((service) => (
          <Pressable
            key={service.id}
            style={styles.service}
            onPress={() =>
              service.id === "friends"
                ? openFriends()
                : service.id === "events"
                  ? setTab("events")
                  : service.id === "food"
                    ? setTab("food")
                    : ["airport", "cleaning", "moving", "market"].includes(
                          service.id,
                        )
                      ? openService(service.id as any)
                      : undefined
            }
          >
            <View
              style={[
                styles.serviceIcon,
                { backgroundColor: service.color + "15" },
              ]}
            >
              <Ionicons
                name={service.icon as any}
                size={23}
                color={service.color}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceLabel}>
                {
                  dashboardLabels[language][
                    service.id as keyof typeof dashboardLabels.EN
                  ]
                }
              </Text>
              <Text style={styles.serviceHint}>{serviceHints[service.id]}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#A1ADBE" />
          </Pressable>
        ))}
      </View>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t.featured}</Text>
        <Pressable onPress={() => setTab("events")}>
          <Text style={styles.seeAll}>{t.see}</Text>
        </Pressable>
      </View>
      {events.slice(0, 2).map((event, index) => (
        <EventCard
          key={event.title}
          event={event}
          language={language}
          favourite={favourites.includes(event.title)}
          onToggleFavourite={() => onToggleFavourite(event.title)}
          onOpen={() => openEvent(event.title)}
          recommendationReason={
            index === 0
              ? tr(
                  language,
                  "Recommended from your Travel and Photography interests",
                  "根据你对旅行和摄影的兴趣推荐",
                  "根據你對旅行及攝影的興趣推介",
                )
              : tr(
                  language,
                  "Because you enjoy Culture events and attended Movie Night",
                  "因为你喜欢文化活动并参加过电影之夜",
                  "因為你喜歡文化活動並參加過電影之夜",
                )
          }
        />
      ))}
      <StudentVerificationSheet
        visible={verificationOpen}
        language={language}
        onClose={() => setVerificationOpen(false)}
      />
    </ScrollView>
  );
}

function TicketModal({
  visible,
  event,
  onClose,
  onOpenGroupChat,
  language,
}: {
  visible: boolean;
  event: (typeof events)[number];
  onClose: () => void;
  onOpenGroupChat: () => void;
  language: Language;
}) {
  const tiers = [
    { name: "Early bird", price: 20, fee: 2 },
    { name: "General admission", price: 25, fee: 2.5 },
    { name: "VIP", price: 40, fee: 4 },
  ];
  const [quantity, setQuantity] = useState<Record<string, number>>({});
  const [checkoutStep, setCheckoutStep] = useState<
    "tickets" | "payment" | "complete"
  >("tickets");
  const [paymentMethod, setPaymentMethod] = useState<
    "Card" | "Apple Pay" | "WeChat Pay"
  >("Card");
  const total = tiers.reduce(
    (sum, tier) => sum + (quantity[tier.name] || 0) * (tier.price + tier.fee),
    0,
  );
  const tierLabel = (name: string) =>
    name === "Early bird"
      ? tr(language, name, "早鸟票", "早鳥票")
      : name === "General admission"
        ? tr(language, name, "普通票", "普通票")
        : name;
  const eventPosition = events.findIndex((item) => item.title === event.title);
  const eventTitle =
    language === "EN"
      ? event.title
      : language === "简体"
        ? event.zh
        : ["泰晤士河遊船", "戶外電影之夜", "國際學生之夜"][eventPosition];
  const eventDate =
    language === "EN"
      ? event.date
      : language === "简体"
        ? ["4月12日，周六", "4月19日，周六", "3月28日，周五"][eventPosition]
        : ["4月12日，週六", "4月19日，週六", "3月28日，週五"][eventPosition];
  const eventPlace =
    language === "EN"
      ? event.place
      : language === "简体"
        ? ["伦敦眼码头", "摄政公园", "伦敦市中心"][eventPosition]
        : ["倫敦眼碼頭", "攝政公園", "倫敦市中心"][eventPosition];
  const closeTicket = () => {
    setCheckoutStep("tickets");
    onClose();
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeTicket}
    >
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHead}>
          <View style={{ width: 28 }} />
          <Text style={styles.modalTitle}>
            {tr(language, "Book tickets", "购买门票", "購買門票")}
          </Text>
          <Pressable
            accessibilityLabel={tr(language, "Close", "关闭", "關閉")}
            onPress={closeTicket}
          >
            <Ionicons name="close" size={28} color={palette.ink} />
          </Pressable>
        </View>
        {checkoutStep === "tickets" ? (
          <>
        <ScrollView contentContainerStyle={styles.ticketBody}>
          <View style={styles.ticketEvent}>
            <Image source={{ uri: event.image }} style={styles.ticketThumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>{eventTitle}</Text>
              <Text style={styles.metaText}>
                {eventDate} · {event.time}
              </Text>
              <Text style={styles.metaText}>{eventPlace}</Text>
            </View>
          </View>
          <View style={styles.groupChatNotice}>
            <Ionicons name="chatbubbles" size={21} color={palette.blue} />
            <View style={{ flex: 1 }}>
              <Text style={styles.supportOptionTitle}>
                {tr(
                  language,
                  "Event group chat included",
                  "自动加入活动群聊",
                  "自動加入活動群聊",
                )}
              </Text>
              <Text style={styles.supportOptionText}>
                {tr(
                  language,
                  "After buying a ticket, you are automatically added to the event group so you can ask the host questions and chat with other attendees.",
                  "购票后会自动加入活动群聊，可向主办方提问并与其他参加者交流。",
                  "購票後會自動加入活動群聊，可向主辦方提問並與其他參加者交流。",
                )}
              </Text>
            </View>
          </View>
          {tiers.map((tier) => (
            <View key={tier.name} style={styles.ticketTier}>
              <View style={styles.ticketTierTop}>
                <Text style={styles.ticketTierName}>
                  {tierLabel(tier.name)}
                </Text>
                <View>
                  <Text style={styles.ticketTierPrice}>
                    £{tier.price.toFixed(2)}
                  </Text>
                  <Text style={styles.ticketFee}>
                    + £{tier.fee.toFixed(2)}{" "}
                    {tr(language, "booking fee", "预订费", "預訂費")}
                  </Text>
                </View>
              </View>
              <View style={styles.quantityRow}>
                {[0, 1, 2, 3, 4, 5].map((number) => (
                  <Pressable
                    key={number}
                    style={[
                      styles.quantityButton,
                      quantity[tier.name] === number && styles.quantityActive,
                    ]}
                    onPress={() =>
                      setQuantity({ ...quantity, [tier.name]: number })
                    }
                  >
                    <Text
                      style={[
                        styles.quantityText,
                        quantity[tier.name] === number &&
                          styles.quantityTextActive,
                      ]}
                    >
                      {number}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.checkoutBar}>
          <View>
            <Text style={styles.detailLabel}>
              {tr(language, "Booking total", "预订总额", "預訂總額")}
            </Text>
            <Text style={styles.checkoutTotal}>£{total.toFixed(2)}</Text>
          </View>
          <Pressable
            style={[styles.checkoutButton, total === 0 && { opacity: 0.45 }]}
            disabled={total === 0}
            onPress={() => setCheckoutStep("payment")}
          >
            <Text style={styles.checkoutButtonText}>
              {tr(language, "Checkout", "结账", "結帳")}
            </Text>
          </Pressable>
        </View>
          </>
        ) : checkoutStep === "payment" ? (
          <ScrollView contentContainerStyle={styles.ticketPaymentBody}>
            <Pressable
              style={styles.paymentBack}
              onPress={() => setCheckoutStep("tickets")}
            >
              <Ionicons name="arrow-back" size={18} color={palette.blue} />
              <Text style={styles.paymentBackText}>
                {tr(language, "Back to ticket selection", "返回选择门票", "返回選擇門票")}
              </Text>
            </Pressable>
            <View style={styles.ticketCheckoutHeader}>
              <View style={styles.eventPaymentLock}>
                <Ionicons name="lock-closed" size={22} color={palette.blue} />
              </View>
              <Text style={styles.eventPaymentTitle}>
                {tr(language, "Complete your booking", "完成预订", "完成預訂")}
              </Text>
              <Text style={styles.eventPaymentSubtitle}>
                {tr(language, "Choose a secure payment method to confirm your tickets.", "选择安全的付款方式以确认门票。", "選擇安全的付款方式以確認門票。")}
              </Text>
            </View>
            <View style={styles.ticketPaymentEvent}>
              <Image source={{ uri: event.image }} style={styles.ticketPaymentThumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.ticketPaymentEventTitle}>{eventTitle}</Text>
                <Text style={styles.ticketPaymentMeta}>{eventDate} · {event.time}</Text>
                <Text style={styles.ticketPaymentMeta}>{eventPlace}</Text>
              </View>
            </View>
            <View style={styles.ticketOrderSummary}>
              <Text style={styles.formSectionTitle}>{tr(language, "Order summary", "订单摘要", "訂單摘要")}</Text>
              {tiers.filter((tier) => (quantity[tier.name] || 0) > 0).map((tier) => (
                <View key={tier.name} style={styles.ticketOrderLine}>
                  <Text style={styles.ticketOrderLineText}>{quantity[tier.name]} × {tierLabel(tier.name)}</Text>
                  <Text style={styles.ticketOrderLinePrice}>£{((quantity[tier.name] || 0) * (tier.price + tier.fee)).toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.ticketOrderTotal}>
                <Text style={styles.ticketOrderTotalLabel}>{tr(language, "Total", "总计", "總計")}</Text>
                <Text style={styles.ticketOrderTotalValue}>£{total.toFixed(2)}</Text>
              </View>
            </View>
            <Text style={styles.formSectionTitle}>{tr(language, "Payment method", "付款方式", "付款方式")}</Text>
            <View style={styles.eventPaymentMethods}>
              {[
                { name: "Card" as const, label: tr(language, "Debit or credit card", "银行卡", "銀行卡"), icon: "card-outline" },
                { name: "Apple Pay" as const, label: "Apple Pay", icon: "logo-apple" },
                { name: "WeChat Pay" as const, label: tr(language, "WeChat Pay", "微信支付", "微信支付"), icon: "chatbubble-ellipses-outline" },
              ].map((method) => (
                <Pressable key={method.name} style={[styles.eventPaymentMethod, paymentMethod === method.name && styles.eventPaymentMethodActive]} onPress={() => setPaymentMethod(method.name)}>
                  <View style={styles.eventPaymentMethodIcon}><Ionicons name={method.icon as any} size={21} color={paymentMethod === method.name ? palette.blue : palette.muted} /></View>
                  <Text style={[styles.eventPaymentMethodText, paymentMethod === method.name && styles.eventPaymentMethodTextActive]}>{method.label}</Text>
                  <Ionicons name={paymentMethod === method.name ? "radio-button-on" : "radio-button-off"} size={20} color={paymentMethod === method.name ? palette.blue : "#AAB7C7"} />
                </Pressable>
              ))}
            </View>
            {paymentMethod === "Card" && (
              <View style={styles.eventCardPaymentForm}>
                <Text style={styles.fieldLabel}>{tr(language, "Card number", "卡号", "卡號")}</Text>
                <TextInput style={styles.eventPaymentInput} keyboardType="number-pad" placeholder="1234 5678 9012 3456" placeholderTextColor="#9AA8BB" />
                <View style={styles.eventPaymentInputRow}>
                  <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>{tr(language, "Expiry", "有效期", "有效期")}</Text><TextInput style={styles.eventPaymentInput} placeholder="MM / YY" placeholderTextColor="#9AA8BB" /></View>
                  <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>CVC</Text><TextInput style={styles.eventPaymentInput} keyboardType="number-pad" placeholder="123" placeholderTextColor="#9AA8BB" secureTextEntry /></View>
                </View>
                <Text style={styles.fieldLabel}>{tr(language, "Name on card", "持卡人姓名", "持卡人姓名")}</Text>
                <TextInput style={styles.eventPaymentInput} placeholder={tr(language, "Full name", "姓名", "姓名")} placeholderTextColor="#9AA8BB" />
              </View>
            )}
            <View style={styles.eventPaymentSecure}><Ionicons name="shield-checkmark" size={19} color={palette.green} /><Text style={styles.eventPaymentSecureText}>{tr(language, "Encrypted payment · Your payment details are protected.", "加密付款 · 你的付款资料受到保护。", "加密付款 · 你的付款資料受到保護。")}</Text></View>
            <Pressable style={styles.primaryButton} onPress={() => setCheckoutStep("complete")}>
              <Ionicons name="lock-closed" size={16} color="white" />
              <Text style={styles.primaryButtonText}>{tr(language, `Pay £${total.toFixed(2)}`, `支付£${total.toFixed(2)}`, `支付£${total.toFixed(2)}`)}</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.ticketCompletePage}>
            <View style={styles.ticketCompleteIcon}><Ionicons name="checkmark" size={42} color="white" /></View>
            <Text style={styles.ticketCompleteTitle}>{tr(language, "Booking confirmed", "预订已确认", "預訂已確認")}</Text>
            <Text style={styles.ticketCompleteText}>{tr(language, "Your tickets are ready and you have been added to the event group chat.", "门票已准备好，你已加入活动群聊。", "門票已準備好，你已加入活動群聊。")}</Text>
            <Pressable style={styles.openGroupChatButton} onPress={() => { closeTicket(); onOpenGroupChat(); }}>
              <Ionicons name="chatbubbles-outline" size={19} color="white" />
              <Text style={styles.primaryButtonText}>{tr(language, "Open event group chat", "打开活动群聊", "開啟活動群聊")}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={closeTicket}><Text style={styles.secondaryButtonText}>{tr(language, "Done", "完成", "完成")}</Text></Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function EventsForum({
  language,
  onPost,
  initialEvent,
  view,
  onViewChange,
  favourites,
  onToggleFavourite,
  onOpenGroupChat,
  onPublishAnnouncement,
}: {
  language: Language;
  onPost?: () => void;
  initialEvent?: string | null;
  view: "browse" | "mine";
  onViewChange: (view: "browse" | "mine") => void;
  favourites: string[];
  onToggleFavourite: (eventTitle: string) => void;
  onOpenGroupChat: () => void;
  onPublishAnnouncement: (announcement: string) => void;
}) {
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<(typeof events)[number] | null>(
    () => events.find((event) => event.title === initialEvent) || null,
  );
  const [ticketOpen, setTicketOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [attending, setAttending] = useState<string[]>([]);
  const [editingEvent, setEditingEvent] = useState<"approved" | "declined" | null>(null);
  const [declinedResubmitted, setDeclinedResubmitted] = useState(false);
  const [managedEventTitle, setManagedEventTitle] = useState("Outdoor Movie Night");
  const [managedEventDate, setManagedEventDate] = useState("29 September 2026");
  const [managedEventTime, setManagedEventTime] = useState("18:00–21:00");
  const [managedEventLocation, setManagedEventLocation] = useState("Regent’s Park");
  const [managedEventCapacity, setManagedEventCapacity] = useState("50");
  const [draftEventTitle, setDraftEventTitle] = useState(managedEventTitle);
  const [draftEventLocation, setDraftEventLocation] = useState(managedEventLocation);
  const [draftEventCapacity, setDraftEventCapacity] = useState(managedEventCapacity);
  const [draftEventDateKey, setDraftEventDateKey] = useState(() => bookingDateFromToday(7));
  const [draftEventStartTime, setDraftEventStartTime] = useState("18:00");
  const [draftEventEndTime, setDraftEventEndTime] = useState("21:00");
  const [draftEventLastEntry, setDraftEventLastEntry] = useState("19:00");
  const [draftEventCategory, setDraftEventCategory] = useState("Culture");
  const [draftEventSummary, setDraftEventSummary] = useState("Bring a blanket and enjoy a film under the stars with the international student community.");
  const [draftEventPrice, setDraftEventPrice] = useState("0.00");
  const [draftEventPhoto, setDraftEventPhoto] = useState<string | null>(events[1].image);
  const [updatePending, setUpdatePending] = useState(false);
  const [eventCancelled, setEventCancelled] = useState(false);
  const openApprovedEditor = () => {
    setDraftEventTitle(managedEventTitle);
    setDraftEventLocation(managedEventLocation);
    setDraftEventCapacity(managedEventCapacity);
    setDraftEventStartTime(managedEventTime.split("–")[0] || "18:00");
    setDraftEventEndTime(managedEventTime.split("–")[1] || "21:00");
    setEditingEvent("approved");
  };
  const pickDraftEventPhoto = async (source: PhotoSource) => {
    const uris = await selectPhotoUris(language, source, { allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (uris[0]) setDraftEventPhoto(uris[0]);
  };
  const categories = [
    "All",
    "Sports",
    "Parties",
    "Culture",
    "Trips",
    "Club events",
    "Other",
  ];
  const openMap = (place: string) =>
    Alert.alert(
      tr(language, "Open location with", "选择地图", "選擇地圖"),
      place,
      [
        {
          text: "Apple 地图",
          onPress: () =>
            Linking.openURL(
              `https://maps.apple.com/?q=${encodeURIComponent(place)}`,
            ),
        },
        {
          text: "Google 地图",
          onPress: () =>
            Linking.openURL(
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`,
            ),
        },
        { text: tr(language, "Cancel", "取消", "取消"), style: "cancel" },
      ],
    );
  if (selected) {
    const position = events.findIndex((item) => item.title === selected.title);
    const title =
      language === "EN"
        ? selected.title
        : language === "简体"
          ? selected.zh
          : ["泰晤士河遊船", "戶外電影之夜", "國際學生之夜"][position];
    const date =
      language === "EN"
        ? selected.date
        : language === "简体"
          ? ["4月12日，周六", "4月19日，周六", "3月28日，周五"][position]
          : ["4月12日，週六", "4月19日，週六", "3月28日，週五"][position];
    const place =
      language === "EN"
        ? selected.place
        : language === "简体"
          ? ["伦敦眼码头", "摄政公园", "伦敦市中心"][position]
          : ["倫敦眼碼頭", "攝政公園", "倫敦市中心"][position];
    const summaries =
      language === "EN"
        ? events.map((item) => item.summary)
        : language === "简体"
          ? [
              "从泰晤士河上欣赏伦敦，并认识来自全市各大学的同学。",
              "带上野餐毯，与国际学生社群一起享受星空下的电影。",
              "国际学生夜店活动，设有国际DJ及优惠预售票。",
            ]
          : [
              "從泰晤士河上欣賞倫敦，並認識來自全市各大學的同學。",
              "帶上野餐墊，與國際學生社群一起享受星空下的電影。",
              "國際學生夜店活動，設有國際DJ及優惠預售票。",
            ];
    const age =
      selected.age === "All ages"
        ? tr(language, "All ages", "不限年龄", "不限年齡")
        : selected.age === "18+ · ID required"
          ? tr(
              language,
              selected.age,
              "18岁以上 · 须出示证件",
              "18歲以上 · 須出示證件",
            )
          : selected.age;
    const eventLink = `https://unimate.uk/events/${selected.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const copyEventLink = async () => {
      try {
        if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(eventLink);
        }
        Alert.alert(
          tr(language, "Link copied", "链接已复制", "連結已複製"),
          eventLink,
        );
      } catch {
        await Share.share({ title, message: `${title}\n${eventLink}` });
      }
    };
    return (
      <>
        <ScrollView
          contentContainerStyle={styles.eventDetail}
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={styles.backLink} onPress={() => setSelected(null)}>
            <Ionicons name="arrow-back" size={20} color={palette.blue} />
            <Text style={styles.backText}>{words[language].eventForum}</Text>
          </Pressable>
          <Image source={{ uri: selected.image }} style={styles.detailImage} />
          <View style={styles.detailCategory}>
            <Text style={styles.eventTagText}>
              {categoryLabel(language, selected.category)}
            </Text>
          </View>
          <View style={styles.detailTitleRow}>
            <Text style={styles.detailTitle}>{title}</Text>
            <Pressable
              style={styles.shareButton}
              accessibilityLabel={tr(language, "Share event", "分享活动", "分享活動")}
              onPress={() => setShareOpen(true)}
            >
              <Ionicons
                name="paper-plane-outline"
                size={21}
                color={palette.blue}
              />
            </Pressable>
          </View>
          <Text style={styles.detailSummary}>{summaries[position]}</Text>
          <View style={styles.detailGrid}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar" size={20} color={palette.blue} />
              <View>
                <Text style={styles.detailLabel}>
                  {tr(language, "Date", "日期", "日期")}
                </Text>
                <Text style={styles.detailValue}>{date}</Text>
              </View>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="time" size={20} color={palette.blue} />
              <View>
                <Text style={styles.detailLabel}>
                  {tr(language, "Time", "时间", "時間")}
                </Text>
                <Text style={styles.detailValue}>{selected.time}</Text>
              </View>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="ticket" size={20} color={palette.blue} />
              <View>
                <Text style={styles.detailLabel}>
                  {tr(language, "Cost", "费用", "費用")}
                </Text>
                <Text style={styles.detailValue}>
                  {selected.price === "Free"
                    ? tr(language, "Free", "免费", "免費")
                    : selected.price}
                </Text>
              </View>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="id-card" size={20} color={palette.blue} />
              <View>
                <Text style={styles.detailLabel}>
                  {tr(language, "Age restriction", "年龄限制", "年齡限制")}
                </Text>
                <Text style={styles.detailValue}>{age}</Text>
              </View>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="enter" size={20} color={palette.blue} />
              <View>
                <Text style={styles.detailLabel}>
                  {tr(language, "Last entry", "最晚入场", "最晚入場")}
                </Text>
                <Text style={styles.detailValue}>{selected.lastEntry}</Text>
              </View>
            </View>
          </View>
          <View style={styles.detailReleaseCard}>
            <View style={styles.detailReleaseIcon}>
              <Ionicons name={selected.spotsLeft === 0 ? "alarm-outline" : "ticket-outline"} size={21} color={palette.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailReleaseTitle}>
                {selected.spotsLeft === 0
                  ? tr(language, "Next ticket release", "下一次放票", "下一次放票")
                  : selected.price === "Free"
                    ? tr(language, "Spot reservations opened", "名额已开放", "名額已開放")
                    : tr(language, "Tickets available since", "门票开售时间", "門票開售時間")}
              </Text>
              <Text style={styles.detailReleaseText}>{selected.releaseAt}</Text>
            </View>
            {selected.spotsLeft === 0 && (
              <Pressable
                style={styles.detailReminderButton}
                onPress={() => Alert.alert(tr(language, "Reminder set", "提醒已设置", "提醒已設定"), tr(language, `We will notify you before tickets are released on ${selected.releaseAt}.`, `我们会在${selected.releaseAt}放票前提醒你。`, `我們會在${selected.releaseAt}放票前提醒你。`))}
              >
                <Text style={styles.detailReminderText}>{tr(language, "Remind me", "提醒我", "提醒我")}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.organiserCard}>
            <View style={styles.organiserLogo}>
              <Text style={styles.organiserInitial}>U</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>
                UNIMATE {tr(language, "Events", "活动", "活動")}
              </Text>
              <Text style={styles.metaText}>
                {tr(
                  language,
                  "Verified organiser · 1.2k followers",
                  "已认证主办方 · 1,200位关注者",
                  "已認證主辦方 · 1,200位關注者",
                )}
              </Text>
              <View style={styles.organiserRating}>
                <Ionicons name="star" size={13} color="#F2A91B" />
                <Text style={styles.organiserRatingText}>
                  4.9 · 312 {tr(language, "reviews", "条评价", "則評價")}
                </Text>
              </View>
            </View>
            <Pressable style={styles.followOrganiser}>
              <Text style={styles.followOrganiserText}>
                {tr(language, "Follow", "关注", "關注")}
              </Text>
            </Pressable>
          </View>
          <View style={styles.locationCard}>
            <Ionicons name="location" size={24} color={palette.coral} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>
                {tr(language, "Location", "地点", "地點")}
              </Text>
              <Text style={styles.detailValue}>{place}</Text>
            </View>
            <Pressable
              style={styles.mapButton}
              onPress={() => openMap(selected.place)}
            >
              <Ionicons name="map-outline" size={17} color="white" />
              <Text style={styles.mapButtonText}>
                {tr(language, "Open map", "打开地图", "開啟地圖")}
              </Text>
            </Pressable>
          </View>
          <View style={styles.verifiedNotice}>
            <Ionicons name="shield-checkmark" size={20} color={palette.green} />
            <Text style={styles.verifiedText}>
              {tr(
                language,
                "Verified by the UNIMATE admin team",
                "经 UNIMATE 管理团队审核",
                "經 UNIMATE 管理團隊審核",
              )}
            </Text>
          </View>
          <Pressable
            disabled={selected.spotsLeft === 0}
            style={[
              styles.primaryButton,
              selected.spotsLeft === 0 && { opacity: 0.45 },
              attending.includes(selected.title) && styles.attendingButton,
            ]}
            onPress={() =>
              attending.includes(selected.title)
                ? onOpenGroupChat()
                : selected.price === "Free"
                ? (() => {
                    setAttending([...attending, selected.title]);
                    Alert.alert(
                      tr(language, "You are going", "已确认参加", "已確認參加"),
                      tr(
                        language,
                        "Your place is confirmed and you have been added automatically to the event group chat in Messages.",
                        "名额已确认，你也已自动加入“消息”中的活动群聊。",
                        "名額已確認，你亦已自動加入「訊息」中的活動群聊。",
                      ),
                    );
                  })()
                : setTicketOpen(true)
            }
          >
            {attending.includes(selected.title) && (
              <Ionicons name="checkmark-circle" size={19} color="white" />
            )}
            <Text style={styles.primaryButtonText}>
              {selected.spotsLeft === 0
                ? tr(language, "Sold out", "已售罄", "已售罄")
                : attending.includes(selected.title)
                  ? tr(
                      language,
                      "Going · Added to group chat",
                      "已参加 · 已加入群聊",
                      "已參加 · 已加入群聊",
                    )
                  : selected.price === "Free"
                    ? tr(language, "Confirm I am going", "确认参加", "確認參加")
                    : tr(language, "Get tickets", "购买门票", "購買門票")}
            </Text>
          </Pressable>
        </ScrollView>
        <TicketModal
          visible={ticketOpen}
          event={selected}
          language={language}
          onClose={() => setTicketOpen(false)}
          onOpenGroupChat={onOpenGroupChat}
        />
        <Sheet
          visible={shareOpen}
          title={tr(language, "Share event", "分享活动", "分享活動")}
          onClose={() => setShareOpen(false)}
        >
          <ScrollView contentContainerStyle={styles.eventShareSheet}>
            <View style={styles.eventSharePreview}>
              <Image source={{ uri: selected.image }} style={styles.eventShareImage} />
              <View style={{ flex: 1 }}><Text style={styles.eventShareTitle}>{title}</Text><Text style={styles.eventShareMeta}>{date} · {place}</Text></View>
            </View>
            <View style={styles.eventShareLinkCard}>
              <View style={styles.eventShareLinkCopy}><Ionicons name="link-outline" size={18} color={palette.blue} /><Text numberOfLines={1} style={styles.eventShareLinkText}>{eventLink}</Text></View>
              <Pressable style={styles.eventShareCopyButton} onPress={copyEventLink}><Ionicons name="copy-outline" size={16} color="white" /><Text style={styles.eventShareCopyText}>{tr(language, "Copy", "复制", "複製")}</Text></Pressable>
            </View>
            <Pressable style={styles.eventShareNativeButton} onPress={() => Share.share({ title, message: `${title}\n${summaries[position]}\n${eventLink}`, url: eventLink })}>
              <Ionicons name="share-social-outline" size={20} color="white" />
              <Text style={styles.primaryButtonText}>{tr(language, "Share link", "分享链接", "分享連結")}</Text>
            </Pressable>
            <Text style={styles.formSectionTitle}>{tr(language, "Send to friends", "发送给好友", "傳送給好友")}</Text>
            <View style={styles.eventShareFriends}>{friends.slice(0, 3).map((friend) => <View key={friend.username} style={styles.eventShareFriendRow}><View style={[styles.avatar, { backgroundColor: friend.color }]}><Text style={styles.avatarText}>{friend.initials}</Text></View><View style={{ flex: 1 }}><Text style={styles.friendName}>{friend.fullName}</Text><Text style={styles.friendUni}>{friend.username}</Text></View><Pressable style={[styles.eventShareSendButton, sharedWith.includes(friend.username) && styles.eventShareSentButton]} onPress={() => setSharedWith([...sharedWith, friend.username])}><Text style={[styles.eventShareSendText, sharedWith.includes(friend.username) && styles.eventShareSentText]}>{sharedWith.includes(friend.username) ? tr(language, "Sent", "已发送", "已傳送") : tr(language, "Send", "发送", "傳送")}</Text></Pressable></View>)}</View>
          </ScrollView>
        </Sheet>
      </>
    );
  }
  if (view === "mine") {
    return (
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.eventsTitleRow}>
          <View>
            <Text style={[styles.pageTitle, { marginBottom: 0 }]}>
              {tr(language, "My events", "我的活动", "我的活動")}
            </Text>
            <Text style={styles.myEventsSubtitle}>
              {tr(
                language,
                "Manage your submissions, attendees and published events.",
                "管理你提交的活动、参加者和已发布活动。",
                "管理你提交的活動、參加者及已發佈活動。",
              )}
            </Text>
          </View>
          {onPost && (
            <Pressable style={styles.postEventButton} onPress={onPost}>
              <Ionicons name="add" size={17} color="white" />
              <Text style={styles.postEventButtonText}>{words[language].post}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.eventViewTabs}>
          <Pressable style={styles.eventViewTab} onPress={() => onViewChange("browse")}>
            <Ionicons name="compass-outline" size={17} color={palette.muted} />
            <Text style={styles.eventViewTabText}>
              {tr(language, "Discover", "发现活动", "發現活動")}
            </Text>
          </Pressable>
          <Pressable style={[styles.eventViewTab, styles.eventViewTabActive]}>
            <Ionicons name="calendar-outline" size={17} color="white" />
            <Text style={[styles.eventViewTabText, styles.eventViewTabTextActive]}>
              {tr(language, "My events", "我的活动", "我的活動")}
            </Text>
          </Pressable>
        </View>
        <View style={styles.myEventsSummary}>
          {[{ value: eventCancelled ? "0" : "1", label: tr(language, "Live", "已上线", "已上線"), color: palette.green }, { value: declinedResubmitted ? "2" : "1", label: tr(language, "Pending", "待审核", "待審核"), color: "#B97A0D" }, { value: declinedResubmitted ? "0" : "1", label: tr(language, "Declined", "未通过", "未通過"), color: palette.coral }].map((item) => (
            <View key={item.label} style={styles.myEventsSummaryItem}>
              <Text style={[styles.myEventsSummaryValue, { color: item.color }]}>{item.value}</Text>
              <Text style={styles.myEventsSummaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.myEventManageCard}>
          <Image source={{ uri: events[1].image }} style={styles.myEventManageImage} />
          <View style={styles.myEventStatusRow}>
            <View style={eventCancelled ? styles.myEventDeclinedPill : styles.myEventLivePill}>
              <Ionicons name={eventCancelled ? "close-circle" : "checkmark-circle"} size={14} color={eventCancelled ? palette.coral : palette.green} />
              <Text style={eventCancelled ? styles.myEventDeclinedText : styles.myEventLiveText}>
                {eventCancelled ? tr(language, "Cancelled", "已取消", "已取消") : tr(language, "Approved · Live", "已审核 · 已上线", "已審核 · 已上線")}
              </Text>
            </View>
            {updatePending && <View style={styles.myEventPendingPill}><Text style={styles.myEventPendingText}>{tr(language, "Changes pending", "更改待审核", "更改待審核")}</Text></View>}
            <Text style={styles.myEventReference}>EV-260922</Text>
          </View>
          <Text style={styles.myEventManageTitle}>{managedEventTitle}</Text>
          <Text style={styles.myEventManageMeta}>
            {managedEventDate} · {managedEventTime}
          </Text>
          {updatePending && <View style={styles.myEventReviewNotice}><Ionicons name="shield-checkmark-outline" size={18} color="#B97A0D" /><Text style={styles.myEventReviewText}>{tr(language, "Your current event remains live with its existing details while the admin team reviews your changes. Once approved, paid attendees will receive a group-chat announcement automatically.", "审核更改期间，当前活动将以现有详情继续上线。通过后，已付款参加者会自动收到群聊公告。", "審核更改期間，目前活動將以現有詳情繼續上線。通過後，已付款參加者會自動收到群組聊天公告。")}</Text></View>}
          {!eventCancelled && <><View style={styles.myEventProgressTrack}>
            <View style={styles.myEventProgressFill} />
          </View>
          <View style={styles.myEventCapacityLine}>
            <Text style={styles.myEventCapacityText}>
              {tr(language, `12 of ${managedEventCapacity} places reserved`, `${managedEventCapacity}个名额已预订12个`, `${managedEventCapacity}個名額已預訂12個`)}
            </Text>
            <Text style={styles.myEventCapacityText}>24%</Text>
          </View></>}
          {eventCancelled && <><View style={styles.cancelledEventNotice}><Ionicons name="information-circle-outline" size={18} color={palette.coral} /><Text style={styles.cancelledEventNoticeText}>{tr(language, "This event has been cancelled. Ticket holders were notified in the group chat and full refunds were allocated automatically.", "此活动已取消。持票者已在群聊中收到通知，全额退款已自动分配。", "此活動已取消。持票者已在群組聊天中收到通知，全額退款已自動分配。")}</Text></View><View style={styles.eventRefundCard}><View style={styles.eventRefundHead}><View style={styles.eventRefundIcon}><Ionicons name="cash-outline" size={20} color={palette.green} /></View><View style={{ flex: 1 }}><Text style={styles.eventRefundTitle}>{tr(language, "Refunds allocated", "退款已分配", "退款已分配")}</Text><Text style={styles.eventRefundMeta}>{tr(language, "Returning to original payment methods", "原路退回付款方式", "原路退回付款方式")}</Text></View><Text style={styles.eventRefundAmount}>£144.00</Text></View><View style={styles.eventRefundFacts}><Text style={styles.eventRefundFact}>12 {tr(language, "attendees", "名参加者", "名參加者")}</Text><Text style={styles.eventRefundFact}>£12.00 {tr(language, "each", "每人", "每人")}</Text><Text style={styles.eventRefundFact}>{tr(language, "5–10 working days", "5–10个工作日", "5–10個工作日")}</Text></View></View></>}
          {!eventCancelled && <View style={styles.myEventActions}>
            <Pressable style={styles.myEventSecondaryAction} onPress={() => updatePending ? Alert.alert(tr(language, "Changes under review", "更改正在审核", "更改正在審核"), tr(language, "You can edit again after the admin team completes this review.", "管理团队完成本次审核后可再次编辑。", "管理團隊完成本次審核後可再次編輯。")) : openApprovedEditor()}>
              <Ionicons name="create-outline" size={17} color={palette.blue} />
              <Text style={styles.myEventSecondaryActionText}>
                {tr(language, "Edit details", "编辑详情", "編輯詳情")}
              </Text>
            </Pressable>
            <Pressable style={styles.myEventPrimaryAction} onPress={() => setSelected(events[1])}>
              <Text style={styles.myEventPrimaryActionText}>
                {tr(language, "View event", "查看活动", "查看活動")}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="white" />
            </Pressable>
          </View>}
          <Pressable style={styles.myEventChatLink} onPress={onOpenGroupChat}>
            <Ionicons name="chatbubbles-outline" size={17} color={palette.blue} />
            <Text style={styles.myEventChatLinkText}>
              {tr(language, "Open attendee group chat", "打开参加者群聊", "開啟參加者群組聊天")}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={palette.blue} />
          </Pressable>
          {!eventCancelled && <Pressable style={styles.cancelEventButton} onPress={() => Alert.alert(
            tr(language, "Cancel this event?", "取消此活动？", "取消此活動？"),
            tr(language, "This will affect 12 paid attendees. Continue to a final confirmation only if the event cannot go ahead.", "此操作将影响12名已付款参加者。仅在活动无法继续时进入最终确认。", "此操作將影響12名已付款參加者。只在活動無法繼續時進入最終確認。"),
            [{ text: tr(language, "Keep event", "保留活动", "保留活動"), style: "cancel" }, { text: tr(language, "Continue", "继续", "繼續"), style: "destructive", onPress: () => Alert.alert(
              tr(language, "Final confirmation", "最终确认", "最終確認"),
              tr(language, "Are you absolutely sure? Cancelling removes the event from discovery, alerts the group chat and automatically allocates full refunds to all paid attendees.", "你确定吗？取消后活动将从发现页移除，群聊会收到公告，并自动向所有已付款参加者分配全额退款。", "你確定嗎？取消後活動將從發現頁移除，群組聊天會收到公告，並自動向所有已付款參加者分配全額退款。"),
              [{ text: tr(language, "Go back", "返回", "返回"), style: "cancel" }, { text: tr(language, "Cancel event", "取消活动", "取消活動"), style: "destructive", onPress: () => { setEventCancelled(true); onPublishAnnouncement(tr(language, `Cancelled: ${managedEventTitle} will no longer take place. Full refunds of £12.00 have been allocated automatically to all 12 paid attendees and should reach the original payment method within 5–10 working days.`, `活动已取消：${managedEventTitle}将不再举行。所有12名已付款参加者均已自动分配£12.00全额退款，预计5–10个工作日内退回原付款方式。`, `活動已取消：${managedEventTitle}將不再舉行。所有12名已付款參加者均已自動分配£12.00全額退款，預計5–10個工作日內退回原付款方式。`)); } }]
            ) }]
          )}>
            <Ionicons name="close-circle-outline" size={17} color={palette.coral} />
            <Text style={styles.cancelEventButtonText}>{tr(language, "Cancel event", "取消活动", "取消活動")}</Text>
          </Pressable>}
        </View>
        <View style={styles.myEventStateCard}>
          <View style={styles.myEventStateHead}>
            <View style={[styles.myEventStateIcon, { backgroundColor: "#FFF5D9" }]}>
              <Ionicons name="time-outline" size={21} color="#B97A0D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.myEventStateTitle}>Welcome to London Mixer</Text>
              <Text style={styles.myEventStateMeta}>{tr(language, "Submitted 22 September 2026", "2026年9月22日提交", "2026年9月22日提交")}</Text>
            </View>
            <View style={styles.myEventPendingPill}><Text style={styles.myEventPendingText}>{tr(language, "Pending approval", "等待审核", "等待審核")}</Text></View>
          </View>
          <View style={styles.myEventReviewNotice}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#B97A0D" />
            <Text style={styles.myEventReviewText}>{tr(language, "UNIMATE is reviewing the venue, safety information and event details. This event is not visible publicly yet.", "UNIMATE正在审核场地、安全信息和活动详情。此活动尚未公开。", "UNIMATE正在審核場地、安全資料及活動詳情。此活動尚未公開。")}</Text>
          </View>
          <Pressable style={styles.myEventStatusAction} onPress={() => Alert.alert(tr(language, "Approval in progress", "审核进行中", "審核進行中"), tr(language, "We will notify you as soon as the review is complete. Most reviews are completed within 24 hours.", "审核完成后我们会立即通知你。大多数审核会在24小时内完成。", "審核完成後我們會立即通知你。大多數審核會在24小時內完成。"))}>
            <Text style={styles.myEventStatusActionText}>{tr(language, "View submission status", "查看提交状态", "查看提交狀態")}</Text>
          </Pressable>
        </View>
        <View style={styles.myEventStateCard}>
          <View style={styles.myEventStateHead}>
            <View style={[styles.myEventStateIcon, { backgroundColor: declinedResubmitted ? "#FFF5D9" : "#FFF0F1" }]}>
              <Ionicons name={declinedResubmitted ? "time-outline" : "close-circle-outline"} size={21} color={declinedResubmitted ? "#B97A0D" : palette.coral} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.myEventStateTitle}>Freshers House Party</Text>
              <Text style={styles.myEventStateMeta}>{tr(language, "Submitted 20 September 2026", "2026年9月20日提交", "2026年9月20日提交")}</Text>
            </View>
            <View style={declinedResubmitted ? styles.myEventPendingPill : styles.myEventDeclinedPill}><Text style={declinedResubmitted ? styles.myEventPendingText : styles.myEventDeclinedText}>{declinedResubmitted ? tr(language, "Pending approval", "等待审核", "等待審核") : tr(language, "Declined", "未通过", "未通過")}</Text></View>
          </View>
          <View style={[styles.myEventReviewNotice, !declinedResubmitted && styles.myEventDeclinedNotice]}>
            <Ionicons name={declinedResubmitted ? "shield-checkmark-outline" : "information-circle-outline"} size={18} color={declinedResubmitted ? "#B97A0D" : palette.coral} />
            <Text style={styles.myEventReviewText}>{declinedResubmitted ? tr(language, "Your revised event is being reviewed again. It remains private until approved.", "修改后的活动正在重新审核，批准前保持私密。", "修改後的活動正在重新審核，批准前保持私密。") : tr(language, "Reason: The venue address could not be verified. Update the full address and safety details before resubmitting.", "原因：场地地址无法验证。请更新完整地址和安全信息后重新提交。", "原因：場地地址無法驗證。請更新完整地址及安全資料後重新提交。")}</Text>
          </View>
          {!declinedResubmitted && <Pressable style={styles.myEventStatusAction} onPress={() => setEditingEvent("declined")}>
            <Text style={styles.myEventStatusActionText}>{tr(language, "Edit and resubmit", "编辑并重新提交", "編輯並重新提交")}</Text>
          </Pressable>}
        </View>
        <Sheet
          visible={editingEvent !== null}
          title={editingEvent === "approved" ? tr(language, "Edit event details", "编辑活动详情", "編輯活動詳情") : tr(language, "Revise declined event", "修改未通过活动", "修改未通過活動")}
          onClose={() => setEditingEvent(null)}
        >
          <ScrollView contentContainerStyle={styles.eventEditBody}>
            <View style={styles.eventEditAnnouncementNotice}><Ionicons name="shield-checkmark-outline" size={20} color={palette.blue} /><Text style={styles.eventEditAnnouncementText}>{tr(language, "Every change requires admin reapproval. Your existing event details stay live during review. After approval, the new details are published and paid attendees receive an automatic group-chat announcement.", "每次更改都需要管理员重新审核。审核期间，现有活动详情继续上线。批准后，新详情才会发布，已付款参加者会自动收到群聊公告。", "每次更改都需要管理員重新審核。審核期間，現有活動詳情繼續上線。批准後，新詳情才會發佈，已付款參加者會自動收到群組聊天公告。")}</Text></View>
            <Text style={styles.formSectionLabel}>{tr(language, "EVENT CATEGORY", "活动分类", "活動分類")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{["Sports", "Parties", "House parties", "Culture", "Trips", "Other"].map((item) => <Pressable key={item} style={[styles.categoryChip, draftEventCategory === item && styles.categoryChipActive]} onPress={() => setDraftEventCategory(item)}><Text style={[styles.categoryChipText, draftEventCategory === item && styles.categoryChipTextActive]}>{categoryLabel(language, item)}</Text></Pressable>)}</ScrollView>
            <View style={styles.photoPicker}>{draftEventPhoto ? <Image source={{ uri: draftEventPhoto }} style={styles.photoPreview} /> : <><View style={styles.photoIcon}><Ionicons name="image-outline" size={27} color={palette.blue} /></View><Text style={styles.photoTitle}>{tr(language, "Update event cover photo", "更新活动封面照片", "更新活動封面相片")}</Text></>}</View>
            <PhotoSourceActions language={language} onCamera={() => pickDraftEventPhoto("camera")} onLibrary={() => pickDraftEventPhoto("library")} />
            <View style={styles.field}><Text style={styles.fieldLabel}>{tr(language, "Event name", "活动名称", "活動名稱")}</Text><TextInput value={editingEvent === "approved" ? draftEventTitle : "Freshers House Party"} onChangeText={editingEvent === "approved" ? setDraftEventTitle : undefined} /></View>
            <EventDateField language={language} value={draftEventDateKey} onChange={setDraftEventDateKey} />
            <EventTimeField label={tr(language, "Start time", "开始时间", "開始時間")} value={draftEventStartTime} onChange={setDraftEventStartTime} />
            <EventTimeField label={tr(language, "End time", "结束时间", "結束時間")} value={draftEventEndTime} onChange={setDraftEventEndTime} />
            <View style={styles.field}><Text style={styles.fieldLabel}>{tr(language, "Location / full address", "地点 / 完整地址", "地點 / 完整地址")}</Text><TextInput value={draftEventLocation} onChangeText={setDraftEventLocation} /></View>
            <View style={[styles.field, { minHeight: 100 }]}><Text style={styles.fieldLabel}>{tr(language, "Summary of the event", "活动简介", "活動簡介")}</Text><TextInput multiline value={draftEventSummary} onChangeText={setDraftEventSummary} /></View>
            <View style={styles.field}><Text style={styles.fieldLabel}>{tr(language, "Cost / ticket price", "费用 / 票价", "費用 / 票價")}</Text><View style={styles.currencyInputRow}><Text style={styles.currencyPrefix}>£</Text><TextInput value={draftEventPrice} onChangeText={setDraftEventPrice} keyboardType="decimal-pad" style={styles.currencyInput} /></View></View>
            <EventTimeField label={tr(language, "Last entry time", "最晚入场时间", "最晚入場時間")} value={draftEventLastEntry} onChange={setDraftEventLastEntry} />
            <View style={styles.eventCapacityField}><View style={styles.eventCapacityHead}><View style={styles.eventCapacityIcon}><Ionicons name="people-outline" size={20} color={palette.blue} /></View><View style={{ flex: 1 }}><Text style={styles.fieldLabel}>{tr(language, "Event capacity", "活动人数上限", "活動人數上限")}</Text><Text style={styles.eventCapacityHint}>{tr(language, "Student events can host up to 50 people.", "学生个人活动最多可容纳50人。", "學生個人活動最多可容納50人。")}</Text></View></View><View style={styles.eventCapacityControl}><Pressable style={styles.eventCapacityButton} onPress={() => setDraftEventCapacity(String(Math.max(12, Number(draftEventCapacity || 12) - 1)))}><Ionicons name="remove" size={20} color={palette.blue} /></Pressable><View style={styles.eventCapacityValueWrap}><Text style={styles.eventCapacityValue}>{draftEventCapacity}</Text><Text style={styles.eventCapacityUnit}>{tr(language, "spots", "个名额", "個名額")}</Text></View><Pressable style={styles.eventCapacityButton} onPress={() => setDraftEventCapacity(String(Math.min(50, Number(draftEventCapacity || 12) + 1)))}><Ionicons name="add" size={20} color={palette.blue} /></Pressable></View><View style={styles.eventCapacityPresets}>{[20, 30, 40, 50].map((value) => <Pressable key={value} style={[styles.eventCapacityPreset, draftEventCapacity === String(value) && styles.eventCapacityPresetActive]} onPress={() => setDraftEventCapacity(String(value))}><Text style={[styles.eventCapacityPresetText, draftEventCapacity === String(value) && styles.eventCapacityPresetTextActive]}>{value}</Text></Pressable>)}</View></View>
            <Pressable style={styles.primaryButton} onPress={() => {
              if (editingEvent === "approved") {
                setUpdatePending(true);
                setEditingEvent(null);
                Alert.alert(tr(language, "Changes submitted for approval", "更改已提交审核", "更改已提交審核"), tr(language, "Your current event remains live. If the admin team approves the changes, the new details will be published and paid attendees will receive a group-chat announcement.", "当前活动将继续上线。若管理团队批准更改，新详情将发布，已付款参加者会收到群聊公告。", "目前活動將繼續上線。若管理團隊批准更改，新詳情將發佈，已付款參加者會收到群組聊天公告。"));
              } else {
                setDeclinedResubmitted(true);
                setEditingEvent(null);
              }
            }}><Text style={styles.primaryButtonText}>{tr(language, "Submit changes for approval", "提交更改以供审核", "提交更改以供審核")}</Text></Pressable>
          </ScrollView>
        </Sheet>
      </ScrollView>
    );
  }
  const shown =
    category === "All"
      ? events
      : events.filter((event) => event.category === category);
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.eventsTitleRow}>
        <Text style={[styles.pageTitle, { marginBottom: 0 }]}>
          {words[language].eventForum}
        </Text>
        {onPost && (
          <Pressable style={styles.postEventButton} onPress={onPost}>
            <Ionicons name="add" size={17} color="white" />
            <Text style={styles.postEventButtonText}>
              {words[language].post}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={styles.eventViewTabs}>
        <Pressable style={[styles.eventViewTab, styles.eventViewTabActive]}>
          <Ionicons name="compass-outline" size={17} color="white" />
          <Text style={[styles.eventViewTabText, styles.eventViewTabTextActive]}>
            {tr(language, "Discover", "发现活动", "發現活動")}
          </Text>
        </Pressable>
        <Pressable style={styles.eventViewTab} onPress={() => onViewChange("mine")}>
          <Ionicons name="calendar-outline" size={17} color={palette.muted} />
          <Text style={styles.eventViewTabText}>
            {tr(language, "My events", "我的活动", "我的活動")}
          </Text>
        </Pressable>
      </View>
      <Search placeholder={words[language].eventSearch} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroller}
        contentContainerStyle={styles.categoryRow}
      >
        {categories.map((item) => (
          <Pressable
            key={item}
            style={[
              styles.categoryChip,
              category === item && styles.categoryChipActive,
            ]}
            onPress={() => setCategory(item)}
          >
            <Text
              style={[
                styles.categoryChipText,
                category === item && styles.categoryChipTextActive,
              ]}
            >
              {categoryLabel(language, item)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {shown.length ? (
        shown.map((event) => (
          <EventCard
            key={event.title}
            event={event}
            language={language}
            favourite={favourites.includes(event.title)}
            onToggleFavourite={() => onToggleFavourite(event.title)}
            onOpen={() => setSelected(event)}
          />
        ))
      ) : (
        <View style={styles.noEvents}>
          <Ionicons name="calendar-outline" size={38} color={palette.blue} />
          <Text style={styles.emptyTitle}>
            {tr(language, "No events yet", "暂无活动", "暫無活動")}
          </Text>
          <Text style={styles.emptyText}>
            {tr(
              language,
              "Be the first student to post in this category.",
              "成为第一个在此分类发布活动的同学。",
              "成為第一個在此分類發佈活動的同學。",
            )}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function FriendRequestCard({
  friend,
  language,
  mode,
  onOpen,
  onAccept,
  onDecline,
  onRetract,
}: {
  friend: (typeof friends)[number];
  language: Language;
  mode: "received" | "sent";
  onOpen: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onRetract?: () => void;
}) {
  const isReceived = mode === "received";
  return (
    <View style={styles.requestCardPro}>
      <Pressable style={styles.requestIdentityRow} onPress={onOpen}>
        <View style={[styles.requestAvatar, { backgroundColor: friend.color }]}>
          <Text style={styles.requestAvatarText}>{friend.initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.requestNameRow}>
            <Text style={styles.requestName}>{friend.username}</Text>
            <Ionicons name="shield-checkmark" size={15} color={palette.green} />
          </View>
          <Text style={styles.requestUniversity}>{friend.uni}</Text>
          <Text style={styles.requestTime}>
            {isReceived
              ? tr(
                  language,
                  "Wants to connect · 2h ago",
                  "想与你成为好友 · 2小时前",
                  "想與你成為好友 · 2小時前",
                )
              : tr(language, "Request pending", "请求等待回应", "請求等待回應")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9AA8B9" />
      </Pressable>
      <View style={styles.requestMatchBox}>
        <Ionicons name="sparkles-outline" size={17} color={palette.blue} />
        <View style={{ flex: 1 }}>
          <Text style={styles.requestMatchTitle}>
            {tr(
              language,
              "Why you might connect",
              "你们可能合得来",
              "你們可能合得來",
            )}
          </Text>
          <Text style={styles.requestMatchText}>
            {friend.interests.slice(0, 2).join("  ·  ")}
          </Text>
        </View>
      </View>
      {isReceived ? (
        <View style={styles.requestActionsPro}>
          <Pressable style={styles.acceptButtonPro} onPress={onAccept}>
            <Ionicons name="checkmark" size={17} color="white" />
            <Text style={styles.acceptTextPro}>
              {tr(language, "Accept", "接受", "接受")}
            </Text>
          </Pressable>
          <Pressable style={styles.declineButtonPro} onPress={onDecline}>
            <Text style={styles.declineTextPro}>
              {tr(language, "Not now", "暂不接受", "暫不接受")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.retractButtonPro} onPress={onRetract}>
          <Ionicons
            name="close-circle-outline"
            size={16}
            color={palette.coral}
          />
          <Text style={styles.retractButtonTextPro}>
            {tr(language, "Retract request", "撤回请求", "撤回請求")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function FriendsHub({ language }: { language: Language }) {
  const [view, setView] = useState<
    "discover" | "requests" | "friends" | "following"
  >("discover");
  const [filter, setFilter] = useState<
    "you" | "university" | "interests" | "events" | "mutual" | "contacts"
  >("you");
  const [selected, setSelected] = useState<(typeof friends)[number] | null>(
    null,
  );
  const [sent, setSent] = useState<string[]>([]);
  const [requests, setRequests] = useState([friends[1], friends[3]]);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [addMethod, setAddMethod] = useState<"username" | "phone" | "contacts">(
    "username",
  );
  const [addValue, setAddValue] = useState("");
  const [requestMode, setRequestMode] = useState<"received" | "sent">(
    "received",
  );
  const [acceptedFriends, setAcceptedFriends] = useState([
    friends[0].username,
    friends[1].username,
  ]);
  const [blockedFriends, setBlockedFriends] = useState<string[]>([]);
  const [mutedFriends, setMutedFriends] = useState<string[]>([]);
  const [following, setFollowing] = useState([
    friends[2].username,
    friends[3].username,
  ]);
  const friendFilterRef = useRef<NativeScrollView>(null);
  const [friendFilterX, setFriendFilterX] = useState(0);
  const [friendFilterContentWidth, setFriendFilterContentWidth] = useState(0);
  const [friendFilterViewportWidth, setFriendFilterViewportWidth] = useState(0);
  const friendFilterMaxX = Math.max(
    0,
    friendFilterContentWidth - friendFilterViewportWidth,
  );
  const moveFriendFilters = (direction: -1 | 1) => {
    const nextX = Math.max(
      0,
      Math.min(friendFilterMaxX, friendFilterX + direction * 180),
    );
    friendFilterRef.current?.scrollTo({ x: nextX, animated: true });
    setFriendFilterX(nextX);
  };
  const labels =
    language === "EN"
      ? {
          title: "Make friends",
          search: "Search by university or interests…",
          discover: "Discover",
          requests: "Requests",
          forYou: "For you",
          sameUni: "Same university",
          sameInterests: "Same interests",
          sameEvents: "Same events",
          mutual: "Mutual friends",
          contacts: "Contacts",
          add: "Add friend",
          sent: "Request sent",
          accept: "Accept",
          decline: "Decline",
          hidden:
            "Full name and social accounts are private until you become friends.",
          about: "About me",
          social: "Social accounts",
          privateSocial:
            "This user has chosen to keep their social usernames private.",
          message: "Message",
        }
      : language === "简体"
        ? {
            title: "认识朋友",
            search: "按大学或兴趣搜索…",
            discover: "发现",
            requests: "好友请求",
            forYou: "为你推荐",
            sameUni: "同校同学",
            sameInterests: "相同兴趣",
            sameEvents: "参加过相同活动",
            mutual: "共同好友",
            contacts: "通讯录",
            add: "添加好友",
            sent: "请求已发送",
            accept: "接受",
            decline: "拒绝",
            hidden: "成为好友前，真实姓名和社交账号将保持隐藏。",
            about: "关于我",
            social: "社交账号",
            privateSocial: "该用户选择隐藏社交账号。",
            message: "发消息",
          }
        : {
            title: "認識朋友",
            search: "按大學或興趣搜尋…",
            discover: "探索",
            requests: "好友請求",
            forYou: "為你推薦",
            sameUni: "同校同學",
            sameInterests: "相同興趣",
            sameEvents: "參加過相同活動",
            mutual: "共同好友",
            contacts: "通訊錄",
            add: "添加好友",
            sent: "請求已發送",
            accept: "接受",
            decline: "拒絕",
            hidden: "成為好友前，真實姓名和社交帳號將保持隱藏。",
            about: "關於我",
            social: "社交帳號",
            privateSocial: "該用戶選擇隱藏社交帳號。",
            message: "發訊息",
          };
  const translateInterest = (item: string) =>
    ({
      Photography: tr(language, item, "摄影", "攝影"),
      Travel: tr(language, item, "旅行", "旅行"),
      "Good food": tr(language, item, "美食", "美食"),
      "K-dramas": tr(language, item, "韩剧", "韓劇"),
      Football: tr(language, item, "足球", "足球"),
      Gym: tr(language, item, "健身", "健身"),
      Music: tr(language, item, "音乐", "音樂"),
      Gaming: tr(language, item, "游戏", "遊戲"),
      Coffee: tr(language, item, "咖啡", "咖啡"),
      Films: tr(language, item, "电影", "電影"),
      "City walks": tr(language, item, "城市漫步", "城市漫步"),
      Food: tr(language, item, "美食", "美食"),
      Technology: tr(language, item, "科技", "科技"),
      Basketball: tr(language, item, "篮球", "籃球"),
      Anime: tr(language, item, "动漫", "動漫"),
    })[item] || item;
  const friendIndex = selected ? friends.indexOf(selected) : 0;
  const courseLabel = selected
    ? language === "EN"
      ? selected.course
      : language === "简体"
        ? ["媒体与传播", "工商管理", "经济学", "计算机科学"][friendIndex]
        : ["媒體與傳播", "工商管理", "經濟學", "電腦科學"][friendIndex]
    : "";
  const promptLabel = selected
    ? language === "EN"
      ? selected.prompt
      : language === "简体"
        ? [
            "我理想中的伦敦周日…",
            "如果你也喜欢这些，我们一定合得来…",
            "我们可以一起…",
            "关于我的一件事…",
          ][friendIndex]
        : [
            "我理想中的倫敦週日…",
            "如果你也喜歡這些，我們一定合得來…",
            "我們可以一起…",
            "關於我的一件事…",
          ][friendIndex]
    : "";
  const answerLabel = selected
    ? language === "EN"
      ? selected.answer
      : language === "简体"
        ? [
            "慢慢吃一顿早午餐，逛画廊，再寻找全城最好喝的抹茶。",
            "随时一起踢球、看演出或深夜觅食。",
            "每个周末探索一个不同的伦敦街区。",
            "我可以同一天写出一个应用，也能错失一个空位三分球。",
          ][friendIndex]
        : [
            "慢慢吃一頓早午餐，逛畫廊，再尋找全城最好喝的抹茶。",
            "隨時一起踢球、看演出或深夜覓食。",
            "每個週末探索一個不同的倫敦街區。",
            "我可以同一天寫出一個應用，也能錯失一個空位三分球。",
          ][friendIndex]
    : "";
  const selectedIsFriend = selected
    ? acceptedFriends.includes(selected.username)
    : false;
  const reportFriend = (friend: (typeof friends)[number]) => {
    const submitReason = (reason: string) =>
      Alert.alert(
        tr(language, "Submit report?", "提交举报？", "提交舉報？"),
        tr(
          language,
          `Reason: ${reason}\n\nThe UNIMATE safety team will review this account, its recent activity and any relevant messages. The person will not be told who reported them.`,
          `原因：${reason}\n\nUNIMATE安全团队将审核此账号、近期活动及相关消息。对方不会知道举报人身份。`,
          `原因：${reason}\n\nUNIMATE安全團隊將審核此帳戶、近期活動及相關訊息。對方不會知道舉報人身分。`,
        ),
        [
          { text: tr(language, "Cancel", "取消", "取消"), style: "cancel" },
          {
            text: tr(language, "Submit report", "提交举报", "提交舉報"),
            style: "destructive",
            onPress: () =>
              Alert.alert(
                tr(language, "Report received", "举报已收到", "舉報已收到"),
                tr(
                  language,
                  "Thank you. Our safety team will review the account and take action if it breaks community rules.",
                  "谢谢。安全团队会审核该账号，如违反社区规则将采取相应措施。",
                  "多謝。安全團隊會審核該帳戶，如違反社群規則將採取相應措施。",
                ),
              ),
          },
        ],
      );
    Alert.alert(
      tr(language, "Report account", "举报账号", "舉報帳戶"),
      tr(
        language,
        "Why are you reporting this account?",
        "你为什么举报此账号？",
        "你為甚麼舉報此帳戶？",
      ),
      [
        {
          text: tr(language, "Fake account or impersonation", "虚假账号或冒充他人", "虛假帳戶或冒充他人"),
          onPress: () => submitReason(tr(language, "Fake account or impersonation", "虚假账号或冒充他人", "虛假帳戶或冒充他人")),
        },
        {
          text: tr(language, "Harassment or bullying", "骚扰或欺凌", "騷擾或欺凌"),
          onPress: () => submitReason(tr(language, "Harassment or bullying", "骚扰或欺凌", "騷擾或欺凌")),
        },
        {
          text: tr(language, "Spam, scam or suspicious activity", "垃圾信息、诈骗或可疑行为", "垃圾訊息、詐騙或可疑行為"),
          onPress: () => submitReason(tr(language, "Spam, scam or suspicious activity", "垃圾信息、诈骗或可疑行为", "垃圾訊息、詐騙或可疑行為")),
        },
        {
          text: tr(language, "Inappropriate content", "不当内容", "不當內容"),
          onPress: () => submitReason(tr(language, "Inappropriate content", "不当内容", "不當內容")),
        },
        { text: tr(language, "Cancel", "取消", "取消"), style: "cancel" },
      ],
    );
  };
  const manageFriend = (friend: (typeof friends)[number]) =>
    Alert.alert(
      tr(language, "Manage friend", "管理好友", "管理好友"),
      friend.username,
      [
        {
          text: tr(
            language,
            "View full profile",
            "查看完整资料",
            "查看完整資料",
          ),
          onPress: () => setSelected(friend),
        },
        {
          text: mutedFriends.includes(friend.username)
            ? tr(
                language,
                "Turn activity notifications on",
                "开启动态通知",
                "開啟動態通知",
              )
            : tr(
                language,
                "Turn activity notifications off",
                "关闭动态通知",
                "關閉動態通知",
              ),
          onPress: () =>
            setMutedFriends(
              mutedFriends.includes(friend.username)
                ? mutedFriends.filter((item) => item !== friend.username)
                : [...mutedFriends, friend.username],
            ),
        },
        {
          text: tr(language, "Remove friend", "删除好友", "刪除好友"),
          style: "destructive",
          onPress: () =>
            setAcceptedFriends(
              acceptedFriends.filter((item) => item !== friend.username),
            ),
        },
        {
          text: tr(language, "Block user", "拉黑用户", "封鎖用戶"),
          style: "destructive",
          onPress: () => {
            setAcceptedFriends(
              acceptedFriends.filter((item) => item !== friend.username),
            );
            setFollowing(following.filter((item) => item !== friend.username));
            setBlockedFriends([...blockedFriends, friend.username]);
          },
        },
        {
          text: tr(language, "Report account", "举报账号", "舉報帳戶"),
          style: "destructive",
          onPress: () => reportFriend(friend),
        },
        { text: tr(language, "Cancel", "取消", "取消"), style: "cancel" },
      ],
    );
  if (selected)
    return (
      <ScrollView contentContainerStyle={styles.friendProfile}>
        <Pressable style={styles.backLink} onPress={() => setSelected(null)}>
          <Ionicons name="arrow-back" size={20} color={palette.blue} />
          <Text style={styles.backText}>{labels.title}</Text>
        </Pressable>
        <View style={styles.friendProfileHero}>
          <View
            style={[
              styles.avatar,
              styles.largeAvatar,
              { backgroundColor: selected.color },
            ]}
          >
            <Text style={styles.largeAvatarText}>{selected.initials}</Text>
          </View>
          <Text style={styles.friendProfileName}>
            {selectedIsFriend ? selected.fullName : selected.username}
          </Text>
          {selectedIsFriend && (
            <Text style={styles.friendUsername}>{selected.username}</Text>
          )}
          <Text style={styles.friendUni}>
            {selected.uni} · {courseLabel}
          </Text>
          <View
            style={[
              styles.privacyPill,
              selectedIsFriend && styles.friendStatusPill,
            ]}
          >
            <Ionicons
              name={selectedIsFriend ? "people" : "shield-checkmark"}
              size={15}
              color={palette.green}
            />
            <Text style={styles.privacyText}>
              {selectedIsFriend
                ? tr(
                    language,
                    "You are friends — their shared full profile is visible.",
                    "你们已是好友，可查看对方选择公开的完整资料。",
                    "你們已是好友，可查看對方選擇公開的完整資料。",
                  )
                : labels.hidden}
            </Text>
          </View>
        </View>
        <Text style={styles.friendSectionTitle}>{labels.about}</Text>
        <View style={styles.promptCard}>
          <Text style={styles.prompt}>{promptLabel}</Text>
          <Text style={styles.answer}>{answerLabel}</Text>
        </View>
        <View style={styles.interestWrap}>
          {selected.interests.map((item) => (
            <View key={item} style={styles.interestChip}>
              <Text style={styles.interestText}>{translateInterest(item)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.friendSectionTitle}>{labels.social}</Text>
        <View style={styles.socialRow}>
          {selected.socials.map((item, index) => (
            <View
              key={item}
              style={[
                styles.socialLocked,
                selectedIsFriend &&
                  selected.socialVisible &&
                  styles.socialUnlocked,
              ]}
            >
              <Text style={styles.socialName}>
                {selectedIsFriend && selected.socialVisible
                  ? `${item} · ${index === 0 ? selected.username.replace("@", "") : selected.username}`
                  : item}
              </Text>
              <Ionicons
                name={
                  selectedIsFriend && selected.socialVisible
                    ? "checkmark-circle"
                    : "lock-closed"
                }
                size={13}
                color={
                  selectedIsFriend && selected.socialVisible
                    ? palette.green
                    : palette.muted
                }
              />
            </View>
          ))}
        </View>
        <Text style={styles.privateNote}>
          {selectedIsFriend && selected.socialVisible
            ? tr(
                language,
                "These details are shared with accepted friends.",
                "这些资料仅向已接受的好友显示。",
                "這些資料只向已接受的好友顯示。",
              )
            : selected.socialVisible
              ? labels.hidden
              : labels.privateSocial}
        </Text>
        {selectedIsFriend && (
          <>
            <Text style={styles.friendSectionTitle}>
              {tr(
                language,
                "Recent reviews & activities",
                "最近评价与活动",
                "最近評價及活動",
              )}
            </Text>
            <View style={styles.profileActivityCard}>
              <Image
                source={{
                  uri: restaurants[friendIndex % restaurants.length].image,
                }}
                style={styles.profileActivityImage}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>
                  {restaurants[friendIndex % restaurants.length].name} ·{" "}
                  {(4.6 + friendIndex * 0.1).toFixed(1)} ★
                </Text>
                <Text style={styles.friendInterests}>
                  {tr(
                    language,
                    "Restaurant review shared with friends",
                    "与好友分享的餐厅评价",
                    "與好友分享的餐廳評價",
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.profileActivityCard}>
              <Image
                source={{ uri: events[friendIndex % events.length].image }}
                style={styles.profileActivityImage}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>
                  {events[friendIndex % events.length].title}
                </Text>
                <Text style={styles.friendInterests}>
                  {tr(
                    language,
                    "Attended event · Activity visible to friends",
                    "已参加活动 · 动态对好友可见",
                    "已參加活動 · 動態對好友可見",
                  )}
                </Text>
              </View>
            </View>
          </>
        )}
        {selectedIsFriend ? (
          <View style={styles.friendProfileActions}>
            <Pressable
              style={[styles.primaryButton, styles.friendMessageButton]}
              onPress={() =>
                Alert.alert(
                  tr(language, "Message", "发消息", "發訊息"),
                  tr(
                    language,
                    "Opening your private friend chat.",
                    "正在打开你们的私人好友对话。",
                    "正在開啟你們的私人好友對話。",
                  ),
                )
              }
            >
              <Text style={styles.primaryButtonText}>{labels.message}</Text>
            </Pressable>
            <Pressable
              style={styles.manageFriendButton}
              onPress={() => manageFriend(selected)}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={21}
                color={palette.muted}
              />
              <Text style={styles.manageFriendText}>
                {tr(language, "Manage", "管理", "管理")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              sent.includes(selected.username)
                ? setSent(sent.filter((item) => item !== selected.username))
                : setSent([...sent, selected.username])
            }
          >
            <Text style={styles.primaryButtonText}>
              {sent.includes(selected.username)
                ? tr(language, "Retract request", "撤回请求", "撤回請求")
                : labels.add}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    );
  const matchReason = (friend: (typeof friends)[number]) =>
    filter === "events"
      ? friend === friends[0] || friend === friends[2]
        ? tr(
            language,
            "You both checked in at Outdoor Movie Night",
            "你们都曾签到参加户外电影之夜",
            "你們都曾簽到參加戶外電影之夜",
          )
        : tr(
            language,
            "You both attended a verified UNIMATE event",
            "你们都参加过经认证的 UNIMATE 活动",
            "你們都參加過經認證的 UNIMATE 活動",
          )
      : filter === "mutual"
        ? tr(
            language,
            `${friend === friends[1] ? 4 : 2} mutual friends`,
            `${friend === friends[1] ? 4 : 2}位共同好友`,
            `${friend === friends[1] ? 4 : 2}位共同好友`,
          )
        : filter === "contacts"
          ? tr(
              language,
              "Found in your contacts",
              "来自你的通讯录",
              "來自你的通訊錄",
            )
          : filter === "university"
            ? tr(
                language,
                `Also studies at ${friend.uni}`,
                `同样就读于 ${friend.uni}`,
                `同樣就讀於 ${friend.uni}`,
              )
            : filter === "interests"
              ? `${translateInterest(friend.interests[0])} · ${translateInterest(friend.interests[1])}`
              : tr(language, "Recommended for you", "为你推荐", "為你推薦");
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.modalBody}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.friendsTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>{labels.title}</Text>
            <Text style={styles.formDesc}>
              {tr(
                language,
                "Connect safely through shared experiences and interests.",
                "通过共同经历和兴趣安全地认识新朋友。",
                "透過共同經歷和興趣安全地認識新朋友。",
              )}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={tr(
              language,
              "Add friends",
              "添加好友",
              "加入好友",
            )}
            style={styles.requestBadge}
            onPress={() => setAddFriendOpen(true)}
          >
            <Ionicons name="person-add" size={18} color={palette.blue} />
            <Text style={styles.requestBadgeText}>{requests.length}</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.friendMainTabs}
        >
          <View style={styles.segment}>
            <Pressable
              style={[
                styles.segmentItem,
                view === "discover" && styles.segmentActive,
              ]}
              onPress={() => setView("discover")}
            >
              <Text
                style={[
                  styles.segmentText,
                  view === "discover" && styles.segmentTextActive,
                ]}
              >
                {labels.discover}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segmentItem,
                view === "requests" && styles.segmentActive,
              ]}
              onPress={() => setView("requests")}
            >
              <Text
                style={[
                  styles.segmentTextSmall,
                  view === "requests" && styles.segmentTextActive,
                ]}
              >
                {labels.requests} ({requests.length})
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segmentItem,
                view === "friends" && styles.segmentActive,
              ]}
              onPress={() => setView("friends")}
            >
              <Text
                style={[
                  styles.segmentText,
                  view === "friends" && styles.segmentTextActive,
                ]}
              >
                {language === "EN" ? "Friends" : "好友"}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segmentItem,
                view === "following" && styles.segmentActive,
              ]}
              onPress={() => setView("following")}
            >
              <Text
                style={[
                  styles.segmentTextSmall,
                  view === "following" && styles.segmentTextActive,
                ]}
              >
                {tr(language, "Following", "关注", "關注")}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
        {view === "friends" ? (
          <>
            <Search
              placeholder={tr(
                language,
                "Search my friends…",
                "搜索我的好友…",
                "搜尋我的好友…",
              )}
            />
            {friends
              .filter(
                (friend) =>
                  acceptedFriends.includes(friend.username) &&
                  !blockedFriends.includes(friend.username),
              )
              .map((friend) => (
                <Pressable
                  style={styles.friend}
                  key={friend.username}
                  onPress={() => setSelected(friend)}
                >
                  <View
                    style={[styles.avatar, { backgroundColor: friend.color }]}
                  >
                    <Text style={styles.avatarText}>{friend.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.friendName}>{friend.fullName}</Text>
                    <Text style={styles.friendInterests}>
                      {friend.username} · {friend.uni}
                    </Text>
                    <Text style={styles.friendNotificationStatus}>
                      {mutedFriends.includes(friend.username)
                        ? tr(
                            language,
                            "Activity notifications off",
                            "动态通知已关闭",
                            "動態通知已關閉",
                          )
                        : tr(
                            language,
                            "Activity notifications on",
                            "动态通知已开启",
                            "動態通知已開啟",
                          )}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.messageCircle}
                    onPress={() =>
                      Alert.alert(
                        labels.message,
                        tr(
                          language,
                          "Opening your private friend chat.",
                          "正在打开你们的私人好友对话。",
                          "正在開啟你們的私人好友對話。",
                        ),
                      )
                    }
                  >
                    <Ionicons
                      name="chatbubble"
                      size={17}
                      color={palette.blue}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.friendMoreButton}
                    onPress={() => manageFriend(friend)}
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={18}
                      color={palette.muted}
                    />
                  </Pressable>
                </Pressable>
              ))}
          </>
        ) : view === "following" ? (
          <>
            <View style={styles.followingNotice}>
              <Ionicons
                name="notifications-outline"
                size={22}
                color={palette.blue}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.supportOptionTitle}>
                  {tr(
                    language,
                    "Activity notifications",
                    "动态通知",
                    "動態通知",
                  )}
                </Text>
                <Text style={styles.supportOptionText}>
                  {tr(
                    language,
                    "Choose who you hear from when they review a place, attend an event or share an activity.",
                    "选择当关注的人评价地点、参加活动或分享动态时是否收到通知。",
                    "選擇當關注的人評價地點、參加活動或分享動態時是否收到通知。",
                  )}
                </Text>
              </View>
            </View>
            {friends
              .filter(
                (friend) =>
                  following.includes(friend.username) &&
                  !blockedFriends.includes(friend.username),
              )
              .map((friend) => (
                <View style={styles.friend} key={friend.username}>
                  <Pressable
                    style={[styles.avatar, { backgroundColor: friend.color }]}
                    onPress={() => setSelected(friend)}
                  >
                    <Text style={styles.avatarText}>{friend.initials}</Text>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => setSelected(friend)}
                  >
                    <Text style={styles.friendName}>{friend.fullName}</Text>
                    <Text style={styles.friendInterests}>
                      {friend.username} · {friend.uni}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{
                      checked: !mutedFriends.includes(friend.username),
                    }}
                    style={[
                      styles.toggle,
                      !mutedFriends.includes(friend.username) &&
                        styles.toggleOn,
                    ]}
                    onPress={() =>
                      setMutedFriends(
                        mutedFriends.includes(friend.username)
                          ? mutedFriends.filter(
                              (item) => item !== friend.username,
                            )
                          : [...mutedFriends, friend.username],
                      )
                    }
                  >
                    <View
                      style={[
                        styles.toggleKnob,
                        !mutedFriends.includes(friend.username) &&
                          styles.toggleKnobOn,
                      ]}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.followingButton}
                    onPress={() =>
                      setFollowing(
                        following.filter((item) => item !== friend.username),
                      )
                    }
                  >
                    <Text style={styles.followingButtonText}>
                      {tr(language, "Following", "已关注", "已關注")}
                    </Text>
                  </Pressable>
                </View>
              ))}
          </>
        ) : view === "discover" ? (
          <>
            <Search placeholder={labels.search} />
            <View style={styles.friendFilterShell}>
              <ScrollView
                ref={friendFilterRef}
                horizontal
                nestedScrollEnabled
                directionalLockEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.friendFilterScroller}
                contentContainerStyle={styles.friendFilterRow}
                scrollEventThrottle={16}
                onLayout={(event) =>
                  setFriendFilterViewportWidth(event.nativeEvent.layout.width)
                }
                onContentSizeChange={(width) =>
                  setFriendFilterContentWidth(width)
                }
                onScroll={(event) =>
                  setFriendFilterX(event.nativeEvent.contentOffset.x)
                }
              >
                {[
                  { id: "you", label: labels.forYou },
                  { id: "university", label: labels.sameUni },
                  { id: "interests", label: labels.sameInterests },
                  { id: "events", label: labels.sameEvents },
                  { id: "mutual", label: labels.mutual },
                  { id: "contacts", label: labels.contacts },
                ].map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setFilter(item.id as typeof filter)}
                  >
                    <Text
                      style={
                        filter === item.id ? styles.chipActive : styles.chip
                      }
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              {friendFilterX > 6 && (
                <Pressable
                  accessibilityLabel={tr(
                    language,
                    "Previous filters",
                    "查看前面的筛选项",
                    "查看前面的篩選項",
                  )}
                  style={[
                    styles.friendFilterArrow,
                    styles.friendFilterArrowLeft,
                  ]}
                  onPress={() => moveFriendFilters(-1)}
                >
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color={palette.blue}
                  />
                </Pressable>
              )}
              {friendFilterX < friendFilterMaxX - 6 && (
                <Pressable
                  accessibilityLabel={tr(
                    language,
                    "More filters",
                    "查看更多筛选项",
                    "查看更多篩選項",
                  )}
                  style={[
                    styles.friendFilterArrow,
                    styles.friendFilterArrowRight,
                  ]}
                  onPress={() => moveFriendFilters(1)}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={palette.blue}
                  />
                </Pressable>
              )}
            </View>
            {filter === "events" && (
              <View style={styles.matchSourceCard}>
                <Ionicons
                  name="ticket-outline"
                  size={22}
                  color={palette.blue}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchSourceTitle}>
                    {language === "EN"
                      ? "People from events you attended"
                      : "你参加过的活动中的同学"}
                  </Text>
                  <Text style={styles.matchSourceText}>
                    {language === "EN"
                      ? "Matches appear only after a verified ticket check-in. Attendance visibility stays under your control."
                      : "只有完成电子票签到后才会推荐，活动记录是否可见由你决定。"}
                  </Text>
                </View>
              </View>
            )}
            {filter === "contacts" && (
              <Pressable
                style={styles.matchSourceCard}
                onPress={() =>
                  Alert.alert(
                    tr(
                      language,
                      "Find friends from contacts",
                      "从通讯录寻找好友",
                      "從通訊錄尋找好友",
                    ),
                    tr(
                      language,
                      "The app will ask for contact permission only after you choose to continue. No contacts are uploaded in this prototype.",
                      "只有在你选择继续后，应用才会请求通讯录权限。此原型不会上传任何联系人。",
                      "只有在你選擇繼續後，應用才會請求通訊錄權限。此原型不會上載任何聯絡人。",
                    ),
                  )
                }
              >
                <Ionicons
                  name="phone-portrait-outline"
                  size={22}
                  color={palette.green}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchSourceTitle}>
                    {tr(
                      language,
                      "Find friends from your contacts",
                      "从通讯录寻找好友",
                      "從通訊錄尋找好友",
                    )}
                  </Text>
                  <Text style={styles.matchSourceText}>
                    {tr(
                      language,
                      "Tap to choose contacts. We will always ask permission first.",
                      "点击后选择联系人，我们会先征求你的同意。",
                      "點擊後選擇聯絡人，我們會先徵求你的同意。",
                    )}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={palette.muted}
                />
              </Pressable>
            )}
            {friends
              .filter(
                (friend) =>
                  !acceptedFriends.includes(friend.username) &&
                  !blockedFriends.includes(friend.username),
              )
              .map((friend) => (
                <Pressable
                  style={styles.friend}
                  key={friend.username}
                  onPress={() => setSelected(friend)}
                >
                  <View
                    style={[styles.avatar, { backgroundColor: friend.color }]}
                  >
                    <Text style={styles.avatarText}>{friend.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.friendName}>{friend.username}</Text>
                    <Text style={styles.friendUni}>{friend.uni}</Text>
                    <Text style={styles.friendInterests}>
                      {matchReason(friend)}
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.follow,
                      sent.includes(friend.username) && styles.followSent,
                    ]}
                    onPress={() =>
                      setSent(
                        sent.includes(friend.username)
                          ? sent.filter((item) => item !== friend.username)
                          : [...sent, friend.username],
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.followText,
                        sent.includes(friend.username) && {
                          color: palette.blue,
                        },
                      ]}
                    >
                      {sent.includes(friend.username) ? "✓" : "+"}
                    </Text>
                  </Pressable>
                </Pressable>
              ))}
          </>
        ) : (
          <>
            <View style={styles.requestOverview}>
              <View style={styles.requestOverviewIcon}>
                <Ionicons
                  name={
                    requestMode === "received"
                      ? "people-outline"
                      : "paper-plane-outline"
                  }
                  size={24}
                  color={palette.blue}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.requestOverviewTitle}>
                  {requestMode === "received"
                    ? tr(
                        language,
                        requests.length + " people want to connect",
                        requests.length +
                          "\u4f4d\u540c\u5b66\u60f3\u8ba4\u8bc6\u4f60",
                        requests.length +
                          "\u4f4d\u540c\u5b78\u60f3\u8a8d\u8b58\u4f60",
                      )
                    : tr(
                        language,
                        sent.length + " requests awaiting a reply",
                        sent.length +
                          "\u4e2a\u8bf7\u6c42\u7b49\u5f85\u56de\u5e94",
                        sent.length +
                          "\u500b\u8acb\u6c42\u7b49\u5f85\u56de\u61c9",
                      )}
                </Text>
                <Text style={styles.requestOverviewText}>
                  {tr(
                    language,
                    "Review each student profile before you decide.",
                    "\u51b3\u5b9a\u524d\u53ef\u5148\u67e5\u770b\u5bf9\u65b9\u7684\u5b66\u751f\u8d44\u6599\u3002",
                    "\u6c7a\u5b9a\u524d\u53ef\u5148\u67e5\u770b\u5c0d\u65b9\u7684\u5b78\u751f\u8cc7\u6599\u3002",
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.requestModeTabs}>
              <Pressable
                style={[
                  styles.requestModeTab,
                  requestMode === "received" && styles.requestModeTabActive,
                ]}
                onPress={() => setRequestMode("received")}
              >
                <Text
                  style={[
                    styles.requestModeText,
                    requestMode === "received" && styles.requestModeTextActive,
                  ]}
                >
                  {tr(
                    language,
                    "Received (" + requests.length + ")",
                    "\u6536\u5230\u7684\u8bf7\u6c42 (" + requests.length + ")",
                    "\u6536\u5230\u7684\u8acb\u6c42 (" + requests.length + ")",
                  )}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.requestModeTab,
                  requestMode === "sent" && styles.requestModeTabActive,
                ]}
                onPress={() => setRequestMode("sent")}
              >
                <Text
                  style={[
                    styles.requestModeText,
                    requestMode === "sent" && styles.requestModeTextActive,
                  ]}
                >
                  {tr(
                    language,
                    "Sent (" + sent.length + ")",
                    "\u5df2\u53d1\u9001 (" + sent.length + ")",
                    "\u5df2\u767c\u9001 (" + sent.length + ")",
                  )}
                </Text>
              </Pressable>
            </View>
            {requestMode === "received" ? (
              requests.length ? (
                requests.map((friend) => (
                  <FriendRequestCard
                    key={friend.username}
                    friend={friend}
                    language={language}
                    mode="received"
                    onOpen={() => setSelected(friend)}
                    onAccept={() => {
                      setRequests(
                        requests.filter(
                          (item) => item.username !== friend.username,
                        ),
                      );
                      setAcceptedFriends([...acceptedFriends, friend.username]);
                    }}
                    onDecline={() =>
                      setRequests(
                        requests.filter(
                          (item) => item.username !== friend.username,
                        ),
                      )
                    }
                  />
                ))
              ) : (
                <View style={styles.requestEmptyState}>
                  <View style={styles.requestEmptyIcon}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={32}
                      color={palette.green}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {tr(
                      language,
                      "You are all caught up",
                      "\u6240\u6709\u8bf7\u6c42\u90fd\u5df2\u5904\u7406",
                      "\u6240\u6709\u8acb\u6c42\u90fd\u5df2\u8655\u7406",
                    )}
                  </Text>
                  <Text style={styles.requestEmptyText}>
                    {tr(
                      language,
                      "New requests will appear here.",
                      "\u65b0\u7684\u597d\u53cb\u8bf7\u6c42\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002",
                      "\u65b0\u7684\u597d\u53cb\u8acb\u6c42\u6703\u986f\u793a\u5728\u9019\u88e1\u3002",
                    )}
                  </Text>
                </View>
              )
            ) : sent.length ? (
              sent.map((username) => {
                const friend = friends.find(
                  (item) => item.username === username,
                );
                return friend ? (
                  <FriendRequestCard
                    key={username}
                    friend={friend}
                    language={language}
                    mode="sent"
                    onOpen={() => setSelected(friend)}
                    onRetract={() =>
                      setSent(sent.filter((item) => item !== username))
                    }
                  />
                ) : null;
              })
            ) : (
              <View style={styles.requestEmptyState}>
                <View style={styles.requestEmptyIcon}>
                  <Ionicons
                    name="paper-plane-outline"
                    size={30}
                    color={palette.blue}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {tr(
                    language,
                    "No sent requests",
                    "\u6682\u65e0\u5df2\u53d1\u9001\u8bf7\u6c42",
                    "\u66ab\u7121\u5df2\u767c\u9001\u8acb\u6c42",
                  )}
                </Text>
                <Text style={styles.requestEmptyText}>
                  {tr(
                    language,
                    "People you add from Discover will appear here.",
                    "\u4f60\u4ece\u53d1\u73b0\u9875\u9762\u6dfb\u52a0\u7684\u4eba\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002",
                    "\u4f60\u5f9e\u63a2\u7d22\u9801\u9762\u52a0\u5165\u7684\u4eba\u6703\u986f\u793a\u5728\u9019\u88e1\u3002",
                  )}
                </Text>
              </View>
            )}
            <View style={styles.requestSafetyCard}>
              <View style={styles.requestSafetyIcon}>
                <Ionicons
                  name="shield-checkmark"
                  size={21}
                  color={palette.green}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.requestSafetyTitle}>
                  {tr(
                    language,
                    "Your privacy stays protected",
                    "\u4fdd\u62a4\u4f60\u7684\u9690\u79c1",
                    "\u4fdd\u969c\u4f60\u7684\u79c1\u96b1",
                  )}
                </Text>
                <Text style={styles.requestSafetyText}>
                  {tr(
                    language,
                    "Only your limited student profile is shown until a request is accepted. You can remove or block anyone later.",
                    "\u63a5\u53d7\u8bf7\u6c42\u524d\uff0c\u53ea\u4f1a\u663e\u793a\u6709\u9650\u7684\u5b66\u751f\u8d44\u6599\u3002\u4e4b\u540e\u4f60\u4ecd\u53ef\u5220\u9664\u6216\u62c9\u9ed1\u4efb\u4f55\u4eba\u3002",
                    "\u63a5\u53d7\u8acb\u6c42\u524d\uff0c\u53ea\u6703\u986f\u793a\u6709\u9650\u7684\u5b78\u751f\u8cc7\u6599\u3002\u4e4b\u5f8c\u4f60\u4ecd\u53ef\u522a\u9664\u6216\u5c01\u9396\u4efb\u4f55\u4eba\u3002",
                  )}
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <Sheet
        visible={addFriendOpen}
        title={tr(language, "Add friends", "添加好友", "加入好友")}
        onClose={() => setAddFriendOpen(false)}
      >
        <ScrollView contentContainerStyle={styles.addFriendBody}>
          <Text style={styles.formDesc}>
            {tr(
              language,
              "Choose how you would like to find someone. Friend requests show only your student profile until accepted.",
              "选择查找好友的方式。请求获接受前只会显示你的学生资料。",
              "選擇尋找好友的方式。請求獲接受前只會顯示你的學生資料。",
            )}
          </Text>
          <View style={styles.addMethodGrid}>
            {(
              [
                {
                  id: "username",
                  icon: "at-outline",
                  label: tr(language, "Username", "用户名", "用戶名稱"),
                },
                {
                  id: "phone",
                  icon: "call-outline",
                  label: tr(language, "Phone number", "手机号码", "電話號碼"),
                },
                {
                  id: "contacts",
                  icon: "book-outline",
                  label: tr(language, "Contact book", "通讯录", "通訊錄"),
                },
              ] as const
            ).map((item) => (
              <Pressable
                key={item.id}
                style={[
                  styles.addMethod,
                  addMethod === item.id && styles.addMethodActive,
                ]}
                onPress={() => {
                  setAddMethod(item.id);
                  setAddValue("");
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={addMethod === item.id ? palette.blue : palette.muted}
                />
                <Text
                  style={[
                    styles.addMethodText,
                    addMethod === item.id && styles.addMethodTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {addMethod === "contacts" ? (
            <View style={styles.contactPermissionCard}>
              <Ionicons
                name="shield-checkmark-outline"
                size={29}
                color={palette.green}
              />
              <Text style={styles.supportOptionTitle}>
                {tr(
                  language,
                  "You stay in control",
                  "由你决定是否授权",
                  "由你決定是否授權",
                )}
              </Text>
              <Text style={styles.supportOptionText}>
                {tr(
                  language,
                  "We ask for contact permission only after you continue. Contacts are used to find matching UNIMATE accounts and are not shown publicly.",
                  "只有点击继续后才会请求通讯录权限。联系人仅用于匹配 UNIMATE 账号，不会公开显示。",
                  "只有點擊繼續後才會請求通訊錄權限。聯絡人只用於配對 UNIMATE 帳號，不會公開顯示。",
                )}
              </Text>
              <Pressable
                style={styles.primaryButton}
                onPress={() =>
                  Alert.alert(
                    tr(
                      language,
                      "Contact permission",
                      "通讯录权限",
                      "通訊錄權限",
                    ),
                    tr(
                      language,
                      "The production app will now request access and let you choose who to invite.",
                      "正式版本会在此请求权限，并让你选择要邀请的联系人。",
                      "正式版本會在此請求權限，並讓你選擇要邀請的聯絡人。",
                    ),
                  )
                }
              >
                <Text style={styles.primaryButtonText}>
                  {tr(
                    language,
                    "Continue to contacts",
                    "继续选择联系人",
                    "繼續選擇聯絡人",
                  )}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {addMethod === "username"
                    ? tr(
                        language,
                        "UNIMATE username",
                        "UNIMATE用户名",
                        "UNIMATE用戶名稱",
                      )
                    : tr(language, "Phone number", "手机号码", "電話號碼")}
                </Text>
                <TextInput
                  value={addValue}
                  onChangeText={setAddValue}
                  autoCapitalize="none"
                  keyboardType={addMethod === "phone" ? "phone-pad" : "default"}
                  placeholder={
                    addMethod === "username" ? "@username" : "+44 7700 900000"
                  }
                  placeholderTextColor="#A1ADBE"
                />
              </View>
              <Pressable
                disabled={!addValue.trim()}
                style={[
                  styles.primaryButton,
                  !addValue.trim() && { opacity: 0.45 },
                ]}
                onPress={() =>
                  Alert.alert(
                    tr(
                      language,
                      "Friend request sent",
                      "好友请求已发送",
                      "好友請求已發送",
                    ),
                    tr(
                      language,
                      "They will see your username and limited student profile before accepting.",
                      "对方接受前将看到你的用户名和有限学生资料。",
                      "對方接受前將看到你的用戶名稱及有限學生資料。",
                    ),
                  )
                }
              >
                <Text style={styles.primaryButtonText}>
                  {tr(
                    language,
                    "Find and add friend",
                    "查找并添加好友",
                    "尋找並加入好友",
                  )}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </Sheet>
    </>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  formatOption = (option) => option,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  hint?: string;
  formatOption?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.selectWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[styles.selectField, open && styles.selectFieldOpen]}
        onPress={() => setOpen(!open)}
      >
        <Text style={styles.selectValue}>{formatOption(value)}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={17}
          color={palette.blue}
        />
      </Pressable>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      {open && (
        <View style={styles.selectMenu}>
          <ScrollView
            style={styles.selectMenuScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {options.map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.selectOption,
                  option === value && styles.selectOptionActive,
                ]}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.selectOptionText,
                    option === value && styles.selectOptionTextActive,
                  ]}
                >
                  {formatOption(option)}
                </Text>
                {option === value && (
                  <Ionicons name="checkmark" size={17} color={palette.blue} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function AirportTransferForm({ language }: { language: Language }) {
  const isEnglish = language === "EN";
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const [journey, setJourney] = useState<"pickup" | "dropoff">("pickup");
  const [terminal, setTerminal] = useState("Heathrow · Terminal 2");
  const [selectedDay, setSelectedDay] = useState(() => bookingDateFromToday(7));
  const [hour, setHour] = useState("10");
  const [minute, setMinute] = useState("00");
  const [passengers, setPassengers] = useState("1 passenger");
  const [smallCases, setSmallCases] = useState("1 small suitcase");
  const [largeCases, setLargeCases] = useState("1 large suitcase");
  const [meeting, setMeeting] = useState<"greet" | "carpark">("greet");
  const [luggageHelp, setLuggageHelp] = useState(true);
  const [currency, setCurrency] = useState<"GBP" | "RMB" | "EUR">("GBP");
  const [payment, setPayment] = useState<
    "WeChat Pay" | "Apple Pay" | "Google Pay" | "Card"
  >("WeChat Pay");
  const [addressMode, setAddressMode] = useState(
    "University College London · WC1E 6BT",
  );
  const [manualAddress, setManualAddress] = useState("");
  const airports = [
    "Heathrow · Terminal 2",
    "Heathrow · Terminal 3",
    "Heathrow · Terminal 4",
    "Heathrow · Terminal 5",
    "Gatwick · North Terminal",
    "Gatwick · South Terminal",
    "London City Airport",
    "Stansted Airport",
    "Luton Airport",
  ];
  const hours = Array.from({ length: 24 }, (_, index) =>
    String(index).padStart(2, "0"),
  );
  const minutes = Array.from({ length: 60 }, (_, index) =>
    String(index).padStart(2, "0"),
  );
  const passengerOptions = [
    "1 passenger",
    "2 passengers",
    "3 passengers",
    "4 passengers",
  ];
  const suitcaseOptions = (size: string) => [
    `0 ${size} suitcases`,
    `1 ${size} suitcase`,
    `2 ${size} suitcases`,
    `3 ${size} suitcases`,
    `4 ${size} suitcases`,
  ];
  const londonLocations = [
    "University College London · WC1E 6BT",
    "Imperial College London · SW7 2AZ",
    "King’s College London · WC2R 2LS",
    "London School of Economics · WC2A 2AE",
    "Enter address manually",
  ];
  const airportOptionLabel = (value: string) =>
    isEnglish
      ? value
      : value
          .replace(
            "Heathrow",
            language === "简体" ? "希思罗机场" : "希斯路機場",
          )
          .replace("Gatwick", language === "简体" ? "盖特威克机场" : "格域機場")
          .replace(
            "London City Airport",
            language === "简体" ? "伦敦城市机场" : "倫敦城市機場",
          )
          .replace(
            "Stansted Airport",
            language === "简体" ? "斯坦斯特德机场" : "史坦斯特機場",
          )
          .replace(
            "Luton Airport",
            language === "简体" ? "卢顿机场" : "盧頓機場",
          )
          .replace(
            "North Terminal",
            language === "简体" ? "北航站楼" : "北航站樓",
          )
          .replace(
            "South Terminal",
            language === "简体" ? "南航站楼" : "南航站樓",
          )
          .replace("Terminal", language === "简体" ? "航站楼" : "航站樓");
  const passengerOptionLabel = (value: string) =>
    isEnglish
      ? value
      : `${value.match(/\d+/)?.[0]}${language === "简体" ? "位乘客" : "位乘客"}`;
  const suitcaseOptionLabel = (value: string) =>
    isEnglish
      ? value
      : `${value.match(/\d+/)?.[0]}${value.includes("small") ? (language === "简体" ? "个小型行李箱" : "個小型行李箱") : language === "简体" ? "个大型行李箱" : "個大型行李箱"}`;
  const londonOptionLabel = (value: string) =>
    isEnglish
      ? value
      : {
          "University College London · WC1E 6BT": `${language === "简体" ? "伦敦大学学院" : "倫敦大學學院"} · WC1E 6BT`,
          "Imperial College London · SW7 2AZ": `${language === "简体" ? "帝国理工学院" : "帝國理工學院"} · SW7 2AZ`,
          "King’s College London · WC2R 2LS": `${language === "简体" ? "伦敦国王学院" : "倫敦國王學院"} · WC2R 2LS`,
          "London School of Economics · WC2A 2AE": `${language === "简体" ? "伦敦政治经济学院" : "倫敦政治經濟學院"} · WC2A 2AE`,
          "Enter address manually":
            language === "简体" ? "手动输入地址" : "手動輸入地址",
        }[value] || value;
  const labels = isEnglish
    ? {
        pickup: "Airport pickup",
        dropoff: "Airport drop-off",
        airport:
          journey === "pickup"
            ? "Pickup airport & terminal"
            : "Drop-off airport & terminal",
        date:
          journey === "pickup"
            ? "Arrival date (London time)"
            : "Departure date",
        time:
          journey === "pickup"
            ? "Arrival time (London time)"
            : "Airport arrival time",
        hour: "Hour",
        minute: "Minute",
        flight: "Flight number",
        flightHint: "For example: BA317",
        london: journey === "pickup" ? "Drop-off location" : "Pickup location",
        addressHint:
          "Choose a London location or enter a full address/postcode.",
        manual: "Full address or postcode",
        passengers: "Passengers",
        small: "Small suitcases",
        large: "Large suitcases",
        meeting: "Where should your driver meet you?",
        greet: "Meet & greet in arrivals",
        carpark: "Meet at the car park",
        help: "Help with luggage",
        helpHint: "Your driver will assist from the meeting point to the car.",
        quote: "Get transfer quote",
        title: "Airport Transfers",
        subtitle: "Safe, reliable and tailored to your journey.",
        capacity:
          "One car carries up to 4 passengers. We will suggest a larger vehicle if your luggage needs more space.",
        received: "Quote request ready",
        receivedBody:
          "Your transfer details have been added. Live pricing and payment will be connected in the production app.",
        manualPlaceholder: "e.g. 22 Bedford Way, London WC1H 0AP",
      }
    : {
        pickup: language === "简体" ? "机场接机" : "機場接機",
        dropoff: language === "简体" ? "机场送机" : "機場送機",
        airport: language === "简体" ? "机场及航站楼" : "機場及航站樓",
        date: language === "简体" ? "日期（伦敦时间）" : "日期（倫敦時間）",
        time: language === "简体" ? "时间（伦敦时间）" : "時間（倫敦時間）",
        hour: language === "简体" ? "小时" : "小時",
        minute: language === "简体" ? "分钟" : "分鐘",
        flight: language === "简体" ? "航班号" : "航班號",
        flightHint: "例如：BA317",
        london:
          journey === "pickup"
            ? language === "简体"
              ? "送达地点"
              : "送達地點"
            : language === "简体"
              ? "上车地点"
              : "上車地點",
        addressHint:
          language === "简体"
            ? "选择伦敦地点，或手动输入完整地址/邮编。"
            : "選擇倫敦地點，或手動輸入完整地址/郵編。",
        manual: language === "简体" ? "完整地址或邮编" : "完整地址或郵編",
        passengers: language === "简体" ? "乘客人数" : "乘客人數",
        small: language === "简体" ? "小型行李箱" : "小型行李箱",
        large: language === "简体" ? "大型行李箱" : "大型行李箱",
        meeting: language === "简体" ? "司机在哪里接您？" : "司機在哪裡接您？",
        greet: language === "简体" ? "到达大厅举牌接机" : "抵達大堂舉牌接機",
        carpark: language === "简体" ? "停车场见面" : "停車場見面",
        help: language === "简体" ? "协助搬运行李" : "協助搬運行李",
        helpHint:
          language === "简体"
            ? "司机会从见面地点协助搬运行李。"
            : "司機會從見面地點協助搬運行李。",
        quote: language === "简体" ? "获取接送报价" : "獲取接送報價",
        title: language === "简体" ? "机场接送" : "機場接送",
        subtitle:
          language === "简体"
            ? "安全可靠，为您的行程量身安排。"
            : "安全可靠，為您的行程量身安排。",
        capacity:
          language === "简体"
            ? "每辆车最多乘坐4人。行李较多时，我们会推荐更大的车型。"
            : "每輛車最多乘坐4人。行李較多時，我們會推薦更大的車型。",
        received: language === "简体" ? "报价信息已准备" : "報價資料已準備",
        receivedBody:
          language === "简体"
            ? "已添加接送详情。正式版本将连接实时价格与付款。"
            : "已加入接送詳情。正式版本將連接即時價格與付款。",
        manualPlaceholder:
          language === "简体" ? "输入完整地址或邮编" : "輸入完整地址或郵編",
      };
  const fareLabels = isEnglish
    ? {
        estimate: "Estimated fare",
        mapEstimate: "Route estimate",
        service: "Base transfer service",
        distance: "Distance charge",
        airportFee: "Airport access fee",
        greetFee: "Meet & greet",
        total: "Estimated total",
        deposit: "50% deposit due now",
        balance: "Balance due before journey",
        eligible: "Within our 2.5-hour airport service area",
        currency: "Pay in",
        payment: "Payment method",
        cardNumber: "Demo card number",
        expiry: "Expiry",
        cvc: "CVC",
        secure:
          "Payment details are not stored in this prototype. Final prices use live routing, traffic and airport charges.",
        payDeposit: "Continue to 50% deposit",
        waitingPolicy: "Waiting time is tracked automatically",
        waitingPolicyText:
          "We track the flight’s actual landing time. A 45-minute grace period is included, then waiting is £0.60/min until the driver confirms “Passenger onboard”. Both sides can see the timestamps.",
        airportAuto:
          "Automatically selected from the airport and journey type.",
      }
    : {
        estimate: language === "简体" ? "预估费用" : "預估費用",
        mapEstimate: language === "简体" ? "路线预估" : "路線預估",
        service: language === "简体" ? "接送基础服务" : "接送基礎服務",
        distance: language === "简体" ? "里程费用" : "里程費用",
        airportFee: language === "简体" ? "机场接送费" : "機場接送費",
        greetFee: language === "简体" ? "举牌接机" : "舉牌接機",
        total: language === "简体" ? "预估总价" : "預估總價",
        deposit: language === "简体" ? "现在支付50%订金" : "現在支付50%訂金",
        balance: language === "简体" ? "行程前支付余款" : "行程前支付餘款",
        eligible:
          language === "简体"
            ? "在机场2.5小时服务范围内"
            : "在機場2.5小時服務範圍內",
        currency: language === "简体" ? "付款货币" : "付款貨幣",
        payment: language === "简体" ? "付款方式" : "付款方式",
        cardNumber: language === "简体" ? "演示卡号" : "示範卡號",
        expiry: language === "简体" ? "有效期" : "有效期",
        cvc: "CVC",
        secure:
          language === "简体"
            ? "此原型不会储存付款资料。正式价格将使用实时路线、交通与机场费用。"
            : "此原型不會儲存付款資料。正式價格將使用即時路線、交通與機場費用。",
        payDeposit: language === "简体" ? "继续支付50%订金" : "繼續支付50%訂金",
        waitingPolicy:
          language === "简体" ? "等候时间自动记录" : "等候時間自動記錄",
        waitingPolicyText:
          language === "简体"
            ? "系统按航班实际落地时间追踪。包含45分钟免费等候，其后每分钟£0.60，直到司机确认“乘客已上车”。双方均可查看时间记录。"
            : "系統按航班實際落地時間追蹤。包含45分鐘免費等候，其後每分鐘£0.60，直到司機確認「乘客已上車」。雙方均可查看時間記錄。",
        airportAuto:
          language === "简体"
            ? "根据所选机场及接送类型自动计算。"
            : "根據所選機場及接送類型自動計算。",
      };
  const airportName = terminal.startsWith("Heathrow")
    ? "Heathrow"
    : terminal.startsWith("Gatwick")
      ? "Gatwick"
      : terminal.startsWith("Stansted")
        ? "Stansted"
        : terminal.startsWith("Luton")
          ? "Luton"
          : "London City";
  const routeData: Record<
    string,
    { miles: number; minutes: number; pickupFee: number; dropoffFee: number }
  > = {
    Heathrow: { miles: 21, minutes: 55, pickupFee: 8, dropoffFee: 7 },
    Gatwick: { miles: 31, minutes: 75, pickupFee: 10, dropoffFee: 10 },
    Stansted: { miles: 40, minutes: 80, pickupFee: 13, dropoffFee: 10 },
    Luton: { miles: 34, minutes: 70, pickupFee: 9, dropoffFee: 9 },
    "London City": { miles: 10, minutes: 35, pickupFee: 8, dropoffFee: 8 },
  };
  const route = routeData[airportName];
  const fare = useMemo(() => {
    const base = journey === "pickup" ? 48 : 42;
    const mileage = route.miles * 2.15;
    const airportAccess =
      journey === "pickup" ? route.pickupFee : route.dropoffFee;
    const greeting = journey === "pickup" && meeting === "greet" ? 12 : 0;
    return {
      base,
      mileage,
      airportAccess,
      greeting,
      total: base + mileage + airportAccess + greeting,
    };
  }, [journey, meeting, route]);
  const rates = { GBP: 1, RMB: 9.1, EUR: 1.17 };
  const symbols = { GBP: "£", RMB: "¥", EUR: "€" };
  const money = (amount: number) =>
    `${symbols[currency]}${(amount * rates[currency]).toFixed(currency === "RMB" ? 0 : 2)}`;
  return (
    <View style={styles.formCard}>
      <View style={styles.formHero}>
        <View style={styles.formHeroIcon}>
          <Ionicons name="airplane" size={27} color={palette.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formTitle}>{labels.title}</Text>
          <Text style={styles.formDesc}>{labels.subtitle}</Text>
        </View>
      </View>
      <View style={styles.transferSegment}>
        <Pressable
          style={[
            styles.transferSegmentItem,
            journey === "pickup" && styles.transferSegmentActive,
          ]}
          onPress={() => setJourney("pickup")}
        >
          <Ionicons
            name="airplane-outline"
            size={17}
            color={journey === "pickup" ? "white" : palette.blue}
          />
          <Text
            style={[
              styles.transferSegmentText,
              journey === "pickup" && styles.transferSegmentTextActive,
            ]}
          >
            {labels.pickup}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.transferSegmentItem,
            journey === "dropoff" && styles.transferSegmentActive,
          ]}
          onPress={() => setJourney("dropoff")}
        >
          <Ionicons
            name="car-outline"
            size={18}
            color={journey === "dropoff" ? "white" : palette.blue}
          />
          <Text
            style={[
              styles.transferSegmentText,
              journey === "dropoff" && styles.transferSegmentTextActive,
            ]}
          >
            {labels.dropoff}
          </Text>
        </Pressable>
      </View>
      <SelectField
        label={labels.airport}
        value={terminal}
        options={airports}
        onChange={setTerminal}
        formatOption={airportOptionLabel}
      />
      <Text style={styles.formSectionTitle}>{labels.date}</Text>
      <AvailabilityCalendar
        selected={selectedDay}
        onSelect={setSelectedDay}
        language={language}
        compact
      />
      <View style={styles.timeTitleRow}>
        <Text style={styles.formSectionTitle}>{labels.time}</Text>
        <View style={styles.selectedTimePill}>
          <Ionicons name="time-outline" size={14} color={palette.blue} />
          <Text style={styles.selectedTimeText}>
            {hour}:{minute}
          </Text>
        </View>
      </View>
      <View
        style={[styles.formTwoColumns, compact && styles.formColumnsCompact]}
      >
        <View style={styles.formHalf}>
          <SelectField
            label={labels.hour}
            value={hour}
            options={hours}
            onChange={setHour}
          />
        </View>
        <View style={styles.formHalf}>
          <SelectField
            label={labels.minute}
            value={minute}
            options={minutes}
            onChange={setMinute}
          />
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{labels.flight}</Text>
        <TextInput
          placeholder={labels.flightHint}
          placeholderTextColor="#A1ADBE"
          autoCapitalize="characters"
        />
      </View>
      <SelectField
        label={labels.london}
        value={addressMode}
        options={londonLocations}
        onChange={setAddressMode}
        hint={labels.addressHint}
        formatOption={londonOptionLabel}
      />
      {addressMode === "Enter address manually" && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{labels.manual}</Text>
          <TextInput
            value={manualAddress}
            onChangeText={setManualAddress}
            placeholder={labels.manualPlaceholder}
            placeholderTextColor="#A1ADBE"
          />
        </View>
      )}
      <View
        style={[styles.formTwoColumns, compact && styles.formColumnsCompact]}
      >
        <View style={styles.formHalf}>
          <SelectField
            label={labels.passengers}
            value={passengers}
            options={passengerOptions}
            onChange={setPassengers}
            formatOption={passengerOptionLabel}
          />
        </View>
        <View style={styles.formHalf}>
          <SelectField
            label={labels.small}
            value={smallCases}
            options={suitcaseOptions("small")}
            onChange={setSmallCases}
            formatOption={suitcaseOptionLabel}
          />
        </View>
      </View>
      <SelectField
        label={labels.large}
        value={largeCases}
        options={suitcaseOptions("large")}
        onChange={setLargeCases}
        formatOption={suitcaseOptionLabel}
      />
      <View style={styles.capacityNote}>
        <Ionicons name="car-sport-outline" size={20} color={palette.blue} />
        <Text style={styles.capacityNoteText}>{labels.capacity}</Text>
      </View>
      <Text style={styles.formSectionTitle}>{labels.meeting}</Text>
      <View style={styles.meetingOptions}>
        {(
          [
            { id: "greet", icon: "person-outline", label: labels.greet },
            { id: "carpark", icon: "car-outline", label: labels.carpark },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            style={[
              styles.meetingOption,
              meeting === item.id && styles.meetingOptionActive,
            ]}
            onPress={() => setMeeting(item.id)}
          >
            <Ionicons
              name={item.icon}
              size={20}
              color={meeting === item.id ? palette.blue : palette.muted}
            />
            <Text
              style={[
                styles.meetingOptionText,
                meeting === item.id && styles.meetingOptionTextActive,
              ]}
            >
              {item.label}
            </Text>
            {meeting === item.id && (
              <Ionicons
                name="checkmark-circle"
                size={19}
                color={palette.blue}
              />
            )}
          </Pressable>
        ))}
      </View>
      <Pressable
        style={styles.assistanceRow}
        onPress={() => setLuggageHelp(!luggageHelp)}
      >
        <View style={[styles.checkbox, luggageHelp && styles.checkboxActive]}>
          {luggageHelp && <Ionicons name="checkmark" size={16} color="white" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.assistanceTitle}>{labels.help}</Text>
          <Text style={styles.assistanceText}>{labels.helpHint}</Text>
        </View>
      </Pressable>
      <BelongingsNotice language={language} context="car" />
      <View style={styles.waitingPolicy}>
        <View style={styles.waitingPolicyIcon}>
          <Ionicons name="time-outline" size={21} color={palette.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.waitingPolicyTitle}>
            {fareLabels.waitingPolicy}
          </Text>
          <Text style={styles.waitingPolicyText}>
            {fareLabels.waitingPolicyText}
          </Text>
        </View>
      </View>
      <View style={styles.fareCard}>
        <View style={styles.fareHead}>
          <View>
            <Text style={styles.formTitle}>{fareLabels.estimate}</Text>
            <Text style={styles.formDesc}>
              {airportOptionLabel(airportName)} · {route.miles}{" "}
              {tr(language, "mi", "英里", "英里")} · ~{route.minutes}{" "}
              {tr(language, "min", "分钟", "分鐘")}
            </Text>
          </View>
          <View style={styles.eligiblePill}>
            <Ionicons name="checkmark-circle" size={15} color={palette.green} />
            <Text style={styles.eligibleText}>{fareLabels.eligible}</Text>
          </View>
        </View>
        {[
          [fareLabels.service, fare.base],
          [fareLabels.distance, fare.mileage],
          [
            `${airportOptionLabel(airportName)} ${journey === "pickup" ? tr(language, "pickup fee", "接机费", "接機費") : tr(language, "drop-off fee", "送机费", "送機費")}`,
            fare.airportAccess,
          ],
          ...(fare.greeting ? [[fareLabels.greetFee, fare.greeting]] : []),
        ].map(([label, amount]) => (
          <View style={styles.fareLine} key={String(label)}>
            <Text style={styles.fareLineLabel}>{label}</Text>
            <Text style={styles.fareLineValue}>{money(Number(amount))}</Text>
          </View>
        ))}
        <View style={styles.airportAutoNote}>
          <Ionicons
            name="information-circle-outline"
            size={14}
            color={palette.blue}
          />
          <Text style={styles.airportAutoText}>{fareLabels.airportAuto}</Text>
        </View>
        <View style={styles.fareTotal}>
          <Text style={styles.fareTotalLabel}>{fareLabels.total}</Text>
          <Text style={styles.fareTotalValue}>{money(fare.total)}</Text>
        </View>
        <View style={styles.depositRow}>
          <View>
            <Text style={styles.depositLabel}>{fareLabels.deposit}</Text>
            <Text style={styles.balanceText}>
              {fareLabels.balance}: {money(fare.total / 2)}
            </Text>
          </View>
          <Text style={styles.depositValue}>{money(fare.total / 2)}</Text>
        </View>
      </View>
      <Text style={styles.formSectionTitle}>{fareLabels.currency}</Text>
      <View style={styles.currencyRow}>
        {(["GBP", "RMB", "EUR"] as const).map((item) => (
          <Pressable
            key={item}
            style={[
              styles.currencyButton,
              currency === item && styles.currencyButtonActive,
            ]}
            onPress={() => setCurrency(item)}
          >
            <Text
              style={[
                styles.currencyButtonText,
                currency === item && styles.currencyButtonTextActive,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.formSectionTitle}>{fareLabels.payment}</Text>
      <View style={styles.paymentGrid}>
        {(
          [
            { name: "WeChat Pay", icon: "chatbubble-ellipses" },
            { name: "Apple Pay", icon: "logo-apple" },
            { name: "Google Pay", icon: "logo-google" },
            { name: "Card", icon: "card" },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.name}
            style={[
              styles.paymentMethod,
              payment === item.name && styles.paymentMethodActive,
            ]}
            onPress={() => setPayment(item.name)}
          >
            <Ionicons
              name={item.icon}
              size={20}
              color={payment === item.name ? palette.blue : palette.muted}
            />
            <Text
              style={[
                styles.paymentMethodText,
                payment === item.name && styles.paymentMethodTextActive,
              ]}
            >
              {item.name === "Card"
                ? tr(language, "Card", "银行卡", "銀行卡")
                : item.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {payment === "Card" && (
        <View style={styles.cardFields}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{fareLabels.cardNumber}</Text>
            <TextInput
              placeholder="•••• •••• •••• 4242"
              placeholderTextColor="#A1ADBE"
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.formTwoColumns}>
            <View style={styles.formHalf}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{fareLabels.expiry}</Text>
                <TextInput placeholder="MM/YY" placeholderTextColor="#A1ADBE" />
              </View>
            </View>
            <View style={styles.formHalf}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{fareLabels.cvc}</Text>
                <TextInput
                  placeholder="•••"
                  placeholderTextColor="#A1ADBE"
                  keyboardType="number-pad"
                  secureTextEntry
                />
              </View>
            </View>
          </View>
        </View>
      )}
      <View style={styles.secureNote}>
        <Ionicons name="lock-closed-outline" size={17} color={palette.blue} />
        <Text style={styles.secureNoteText}>{fareLabels.secure}</Text>
      </View>
      <Pressable
        style={styles.primaryButton}
        onPress={() =>
          Alert.alert(
            labels.received,
            `${labels.receivedBody}\n\n${fareLabels.deposit}: ${money(fare.total / 2)}`,
          )
        }
      >
        <Text style={styles.primaryButtonText}>{fareLabels.payDeposit}</Text>
      </Pressable>
    </View>
  );
}

function CounterRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.counterRow}>
      <Text style={styles.counterLabel}>{label}</Text>
      <View style={styles.counterControls}>
        <Pressable
          accessibilityLabel={`Remove ${label}`}
          style={styles.counterButton}
          onPress={() => onChange(Math.max(0, value - 1))}
        >
          <Ionicons name="remove" size={18} color={palette.blue} />
        </Pressable>
        <Text style={styles.counterValue}>{value}</Text>
        <Pressable
          accessibilityLabel={`Add ${label}`}
          style={styles.counterButton}
          onPress={() => onChange(Math.min(10, value + 1))}
        >
          <Ionicons name="add" size={18} color={palette.blue} />
        </Pressable>
      </View>
    </View>
  );
}

function BelongingsNotice({
  language,
  context,
}: {
  language: Language;
  context: "car" | "property" | "move";
}) {
  const place =
    context === "car"
      ? tr(language, "in the vehicle", "在车内", "在車內")
      : context === "property"
        ? tr(language, "at the property", "在房屋内", "在單位內")
        : tr(language, "during the move", "在搬家过程中", "在搬屋過程中");
  return (
    <View style={styles.belongingsNotice}>
      <View style={styles.belongingsIcon}>
        <Ionicons name="briefcase-outline" size={20} color="#8A5B00" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.belongingsTitle}>
          {tr(
            language,
            "Personal belongings & lost property",
            "个人物品与失物",
            "個人物品及失物",
          )}
        </Text>
        <Text style={styles.belongingsText}>
          {tr(
            language,
            `Keep valuables with you and secure all belongings ${place}. UNIMATE and service providers cannot accept liability for unsecured items. If a team member finds something, they can report it in the app so support can verify the owner and arrange a safe return.`,
            `请随身保管贵重物品，并妥善收好${place}的所有个人物品。UNIMATE及服务人员不对未妥善保管的物品承担责任。如工作人员发现遗失物品，可在应用内上报，由客服核实失主并安排安全归还。`,
            `請隨身保管貴重物品，並妥善收好${place}的所有個人物品。UNIMATE及服務人員不對未妥善保管的物品承擔責任。如工作人員發現遺失物品，可在應用程式內上報，由客服核實物主並安排安全歸還。`,
          )}
        </Text>
      </View>
    </View>
  );
}

function AvailabilityCalendar({
  selected,
  onSelect,
  language,
  compact = false,
}: {
  selected: string;
  onSelect: (day: string) => void;
  language: Language;
  compact?: boolean;
}) {
  const unavailable = [2, 5, 9, 13, 18, 24, 29];
  const limited = [7, 12, 21, 27];
  const weekdays =
    language === "EN"
      ? ["M", "T", "W", "T", "F", "S", "S"]
      : ["一", "二", "三", "四", "五", "六", "日"];
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const lastBookableDay = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + 28);
    return date;
  }, [today]);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = dateFromKey(selected);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const monthStart = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), 1);
  const canGoBack = visibleMonth.getTime() > monthStart(today).getTime();
  const canGoForward =
    visibleMonth.getTime() < monthStart(lastBookableDay).getTime();
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const numberOfDays = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const days = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: numberOfDays }, (_, index) => index + 1),
  ];
  const monthLabel = visibleMonth.toLocaleDateString(
    language === "EN" ? "en-GB" : language === "简体" ? "zh-CN" : "zh-TW",
    { month: "long", year: "numeric" },
  );
  const moveMonth = (amount: number) =>
    setVisibleMonth(
      new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1),
    );
  return (
    <View style={[styles.calendarCard, compact && styles.calendarCardCompact]}>
      <View
        style={[styles.calendarHead, compact && styles.calendarHeadCompact]}
      >
        <Pressable
          accessibilityLabel={tr(
            language,
            "Previous month",
            "上个月",
            "上個月",
          )}
          disabled={!canGoBack}
          style={[
            styles.calendarArrow,
            compact && styles.calendarArrowCompact,
            !canGoBack && styles.calendarArrowDisabled,
          ]}
          onPress={() => moveMonth(-1)}
        >
          <Ionicons
            name="chevron-back"
            size={compact ? 15 : 18}
            color={canGoBack ? palette.muted : "#C9D2DF"}
          />
        </Pressable>
        <View>
          <Text style={styles.calendarMonth}>{monthLabel}</Text>
          {!compact && (
            <Text style={styles.calendarSub}>
              {tr(
                language,
                "Book from today up to 4 weeks ahead",
                "可预约今天起未来4周",
                "可預約今天起未來4週",
              )}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityLabel={tr(language, "Next month", "下个月", "下個月")}
          disabled={!canGoForward}
          style={[
            styles.calendarArrow,
            compact && styles.calendarArrowCompact,
            !canGoForward && styles.calendarArrowDisabled,
          ]}
          onPress={() => moveMonth(1)}
        >
          <Ionicons
            name="chevron-forward"
            size={compact ? 15 : 18}
            color={canGoForward ? palette.muted : "#C9D2DF"}
          />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {weekdays.map((day, index) => (
          <Text key={`${day}-${index}`} style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {days.map((day, index) => {
          if (day === null)
            return (
              <View
                key={`blank-${index}`}
                style={[
                  styles.calendarDay,
                  compact && styles.calendarDayCompact,
                ]}
              />
            );
          const candidate = new Date(
            visibleMonth.getFullYear(),
            visibleMonth.getMonth(),
            day,
          );
          const key = dateKey(candidate);
          const outsideWindow =
            candidate < today || candidate > lastBookableDay;
          const blocked = outsideWindow || unavailable.includes(day);
          const isLimited = !outsideWindow && limited.includes(day);
          const isSelected = selected === key;
          return (
            <Pressable
              key={key}
              disabled={blocked}
              accessibilityState={{ disabled: blocked, selected: isSelected }}
              style={[
                styles.calendarDay,
                compact && styles.calendarDayCompact,
                blocked && styles.calendarDayUnavailable,
                isLimited && styles.calendarDayLimited,
                isSelected && styles.calendarDaySelected,
              ]}
              onPress={() => onSelect(key)}
            >
              <Text
                style={[
                  styles.calendarDayText,
                  blocked && styles.calendarDayTextUnavailable,
                  isSelected && styles.calendarDayTextSelected,
                ]}
              >
                {day}
              </Text>
              {isLimited && !isSelected && <View style={styles.limitedDot} />}
            </Pressable>
          );
        })}
      </View>
      {!compact && (
        <View style={styles.calendarLegend}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: palette.green }]}
            />
            <Text style={styles.legendText}>
              {tr(language, "Available", "可预约", "可預約")}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#F2B94B" }]} />
            <Text style={styles.legendText}>
              {tr(language, "Limited", "少量", "少量")}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#D6DEE8" }]} />
            <Text style={styles.legendText}>
              {tr(
                language,
                "Outside booking window",
                "不在预约范围内",
                "不在預約範圍內",
              )}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function VisitDateDropdown({
  selected,
  onSelect,
  language,
}: {
  selected: string;
  onSelect: (day: string) => void;
  language: Language;
}) {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const earliest = useMemo(() => {
    const date = new Date(today);
    date.setFullYear(date.getFullYear() - 1);
    return date;
  }, [today]);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const numberOfDays = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const days = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: numberOfDays }, (_, index) => index + 1),
  ];
  const weekdays =
    language === "EN"
      ? ["M", "T", "W", "T", "F", "S", "S"]
      : ["一", "二", "三", "四", "五", "六", "日"];
  const monthLabel = visibleMonth.toLocaleDateString(
    language === "EN" ? "en-GB" : language === "简体" ? "zh-CN" : "zh-TW",
    { month: "long", year: "numeric" },
  );
  const canGoBack =
    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1) >
    new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  const canGoForward =
    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1) <
    new Date(today.getFullYear(), today.getMonth(), 1);
  return (
    <View style={styles.visitDateWrap}>
      <Text style={styles.fieldLabel}>
        {tr(language, "Visit date", "到访日期", "到訪日期")}
      </Text>
      <Pressable
        style={styles.visitDateButton}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="calendar-outline" size={18} color={palette.blue} />
          <Text style={styles.visitDateValue}>
            {formatBookingDate(selected, language)}
          </Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={17}
          color={palette.blue}
        />
      </Pressable>
      {open && (
        <View style={styles.visitCalendar}>
          <View style={styles.calendarHead}>
            <Pressable
              disabled={!canGoBack}
              style={[
                styles.calendarArrow,
                !canGoBack && styles.calendarArrowDisabled,
              ]}
              onPress={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() - 1,
                    1,
                  ),
                )
              }
            >
              <Ionicons
                name="chevron-back"
                size={17}
                color={canGoBack ? palette.muted : "#C9D2DF"}
              />
            </Pressable>
            <View>
              <Text style={styles.calendarMonth}>{monthLabel}</Text>
              <Text style={styles.calendarSub}>
                {tr(
                  language,
                  "Select a visit from the past 12 months",
                  "选择过去12个月内的到访日期",
                  "選擇過去12個月內的到訪日期",
                )}
              </Text>
            </View>
            <Pressable
              disabled={!canGoForward}
              style={[
                styles.calendarArrow,
                !canGoForward && styles.calendarArrowDisabled,
              ]}
              onPress={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() + 1,
                    1,
                  ),
                )
              }
            >
              <Ionicons
                name="chevron-forward"
                size={17}
                color={canGoForward ? palette.muted : "#C9D2DF"}
              />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {weekdays.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {days.map((day, index) => {
              if (day === null)
                return (
                  <View
                    key={`visit-blank-${index}`}
                    style={styles.calendarDay}
                  />
                );
              const candidate = new Date(
                visibleMonth.getFullYear(),
                visibleMonth.getMonth(),
                day,
              );
              const key = dateKey(candidate);
              const disabled = candidate > today || candidate < earliest;
              const active = key === selected;
              return (
                <Pressable
                  key={key}
                  disabled={disabled}
                  style={[
                    styles.calendarDay,
                    disabled && styles.calendarDayUnavailable,
                    active && styles.calendarDaySelected,
                  ]}
                  onPress={() => {
                    onSelect(key);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      disabled && styles.calendarDayTextUnavailable,
                      active && styles.calendarDayTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function CleaningServiceForm({ language }: { language: Language }) {
  const isEnglish = language === "EN";
  const [cleanType, setCleanType] = useState<
    "Regular" | "Deep" | "End of tenancy" | "Custom"
  >("Regular");
  const [propertyType, setPropertyType] = useState("Student flat / apartment");
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [kitchens, setKitchens] = useState(1);
  const [livingRooms, setLivingRooms] = useState(1);
  const [selectedDay, setSelectedDay] = useState(() => bookingDateFromToday(7));
  const [timeSlot, setTimeSlot] = useState("09:00–12:00");
  const [parking, setParking] = useState("Free parking available");
  const [parkingFee, setParkingFee] = useState("£0");
  const [pets, setPets] = useState("No pets");
  const [photos, setPhotos] = useState<string[]>([]);
  const cleanTypes = [
    { id: "Regular", icon: "calendar-outline" },
    { id: "Deep", icon: "water-outline" },
    { id: "End of tenancy", icon: "key-outline" },
    { id: "Custom", icon: "options-outline" },
  ] as const;
  const labels = isEnglish
    ? {
        title: "Cleaning Services",
        subtitle: "A cleaner space. A brighter student life.",
        service: "Choose your clean",
        property: "Property type",
        layout: "Property layout",
        bedrooms: "Bedrooms",
        bathrooms: "Bathrooms",
        kitchens: "Kitchens",
        livingRooms: "Living rooms",
        date: "Preferred date & availability",
        time: "Arrival window",
        address: "Property address",
        addressHint: "Full address and postcode",
        parking: "Parking details for our cleaners",
        parkingFee: "Expected parking fee",
        parkingNote:
          "Any verified parking charge will be included transparently in your final quote.",
        pets: "Pets at the property",
        instructions: "Special instructions",
        instructionsHint:
          "Tell us about access, priority rooms, fragile items, carpets, personal belongings, or anything else we should know.",
        photos: "Room photos (optional)",
        photoHint:
          "Upload up to 6 photos so we can understand the condition and prepare the right team.",
        upload: "Add room photos",
        quote: "Get a cleaning quote",
        received: "Cleaning quote requested",
        receivedBody:
          "Your property details and preferred availability have been added. Our team will confirm the final price, including any parking fee.",
        regular: "Regular",
        deep: "Deep clean",
        tenancy: "End of tenancy",
        custom: "Custom clean",
      }
    : {
        title: language === "简体" ? "保洁服务" : "清潔服務",
        subtitle:
          language === "简体"
            ? "洁净空间，留学生活更美好。"
            : "潔淨空間，留學生活更美好。",
        service: language === "简体" ? "选择清洁类型" : "選擇清潔類型",
        property: language === "简体" ? "房屋类型" : "房屋類型",
        layout: language === "简体" ? "房屋布局" : "房屋佈局",
        bedrooms: language === "简体" ? "卧室" : "睡房",
        bathrooms: language === "简体" ? "浴室" : "浴室",
        kitchens: language === "简体" ? "厨房" : "廚房",
        livingRooms: language === "简体" ? "客厅" : "客廳",
        date: language === "简体" ? "首选日期与档期" : "首選日期與檔期",
        time: language === "简体" ? "上门时间段" : "上門時間段",
        address: language === "简体" ? "房屋地址" : "房屋地址",
        addressHint: language === "简体" ? "完整地址及邮编" : "完整地址及郵編",
        parking: language === "简体" ? "清洁人员停车详情" : "清潔人員泊車詳情",
        parkingFee: language === "简体" ? "预计停车费" : "預計泊車費",
        parkingNote:
          language === "简体"
            ? "经核实的停车费将清楚列入最终报价。"
            : "經核實的泊車費將清楚列入最終報價。",
        pets: language === "简体" ? "房屋内是否有宠物" : "房屋內是否有寵物",
        instructions: language === "简体" ? "特别说明" : "特別說明",
        instructionsHint:
          language === "简体"
            ? "请说明门禁、重点房间、易碎品、地毯、个人物品或其他注意事项。"
            : "請說明門禁、重點房間、易碎品、地氈、個人物品或其他注意事項。",
        photos: language === "简体" ? "房间照片（可选）" : "房間照片（可選）",
        photoHint:
          language === "简体"
            ? "最多上传6张照片，方便我们了解房间状况并安排合适人员。"
            : "最多上載6張照片，方便我們了解房間狀況並安排合適人員。",
        upload: language === "简体" ? "添加房间照片" : "加入房間照片",
        quote: language === "简体" ? "获取清洁报价" : "獲取清潔報價",
        received:
          language === "简体" ? "已提交清洁报价请求" : "已提交清潔報價請求",
        receivedBody:
          language === "简体"
            ? "已添加房屋详情与首选时间。团队会确认最终价格，包括停车费。"
            : "已加入房屋詳情與首選時間。團隊會確認最終價格，包括泊車費。",
        regular: language === "简体" ? "日常清洁" : "日常清潔",
        deep: language === "简体" ? "深度清洁" : "深度清潔",
        tenancy: language === "简体" ? "退租清洁" : "退租清潔",
        custom: language === "简体" ? "自定义" : "自訂",
      };
  const propertyLabel = (value: string) =>
    ({
      "Student flat / apartment": tr(language, value, "学生公寓", "學生公寓"),
      House: tr(language, value, "独立屋", "獨立屋"),
      Studio: tr(language, value, "单间公寓", "開放式單位"),
      "Bedroom in a flatshare": tr(
        language,
        value,
        "合租房内的卧室",
        "合租單位內的睡房",
      ),
    })[value] || value;
  const parkingLabel = (value: string) =>
    ({
      "Free parking available": tr(language, value, "可免费停车", "可免費泊車"),
      "Resident/visitor permit required": tr(
        language,
        value,
        "需要住户/访客停车证",
        "需要住戶/訪客泊車證",
      ),
      "Paid street parking": tr(
        language,
        value,
        "路边收费停车",
        "路邊收費泊車",
      ),
      "Paid car park nearby": tr(
        language,
        value,
        "附近有收费停车场",
        "附近有收費停車場",
      ),
      "No parking available": tr(language, value, "没有停车位", "沒有泊車位"),
    })[value] || value;
  const petLabel = (value: string) =>
    ({
      "No pets": tr(language, value, "没有宠物", "沒有寵物"),
      "Dog at property": tr(language, value, "房屋内有狗", "房屋內有狗"),
      "Cat at property": tr(language, value, "房屋内有猫", "房屋內有貓"),
      "Other pet": tr(language, value, "其他宠物", "其他寵物"),
    })[value] || value;
  const pickPhotos = async (source?: PhotoSource) => {
    if (!source) {
      askPhotoSource(language, pickPhotos);
      return;
    }
    const uris = await selectPhotoUris(language, source, {
      multiple: source === "library",
      limit: Math.max(1, 6 - photos.length),
      quality: 0.75,
    });
    if (uris.length) setPhotos([...photos, ...uris].slice(0, 6));
  };
  const cleanName =
    cleanType === "Regular"
      ? labels.regular
      : cleanType === "Deep"
        ? labels.deep
        : cleanType === "End of tenancy"
          ? labels.tenancy
          : labels.custom;
  return (
    <View style={styles.formCard}>
      <View style={styles.formHero}>
        <View style={[styles.formHeroIcon, { backgroundColor: "#FFF5E8" }]}>
          <Ionicons name="sparkles" size={27} color="#F28A18" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formTitle}>{labels.title}</Text>
          <Text style={styles.formDesc}>{labels.subtitle}</Text>
        </View>
      </View>
      <Text style={styles.formSectionTitle}>{labels.service}</Text>
      <View style={styles.cleanTypeGrid}>
        {cleanTypes.map((item) => {
          const label =
            item.id === "Regular"
              ? labels.regular
              : item.id === "Deep"
                ? labels.deep
                : item.id === "End of tenancy"
                  ? labels.tenancy
                  : labels.custom;
          return (
            <Pressable
              key={item.id}
              style={[
                styles.cleanType,
                cleanType === item.id && styles.cleanTypeActive,
              ]}
              onPress={() => setCleanType(item.id)}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={cleanType === item.id ? "white" : palette.blue}
              />
              <Text
                style={[
                  styles.cleanTypeText,
                  cleanType === item.id && styles.cleanTypeTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <SelectField
        label={labels.property}
        value={propertyType}
        options={[
          "Student flat / apartment",
          "House",
          "Studio",
          "Bedroom in a flatshare",
        ]}
        onChange={setPropertyType}
        formatOption={propertyLabel}
      />
      <Text style={styles.formSectionTitle}>{labels.layout}</Text>
      <View style={styles.counterCard}>
        <CounterRow
          label={labels.bedrooms}
          value={bedrooms}
          onChange={setBedrooms}
        />
        <CounterRow
          label={labels.bathrooms}
          value={bathrooms}
          onChange={setBathrooms}
        />
        <CounterRow
          label={labels.kitchens}
          value={kitchens}
          onChange={setKitchens}
        />
        <CounterRow
          label={labels.livingRooms}
          value={livingRooms}
          onChange={setLivingRooms}
        />
      </View>
      <Text style={styles.formSectionTitle}>{labels.date}</Text>
      <AvailabilityCalendar
        selected={selectedDay}
        onSelect={setSelectedDay}
        language={language}
      />
      <SelectField
        label={labels.time}
        value={timeSlot}
        options={["09:00–12:00", "12:00–15:00", "15:00–18:00"]}
        onChange={setTimeSlot}
      />
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{labels.address}</Text>
        <TextInput
          placeholder={labels.addressHint}
          placeholderTextColor="#A1ADBE"
        />
      </View>
      <SelectField
        label={labels.parking}
        value={parking}
        options={[
          "Free parking available",
          "Resident/visitor permit required",
          "Paid street parking",
          "Paid car park nearby",
          "No parking available",
        ]}
        onChange={setParking}
        formatOption={parkingLabel}
      />
      {parking !== "Free parking available" && (
        <SelectField
          label={labels.parkingFee}
          value={parkingFee}
          options={["£0", "£5", "£10", "£15", "£20+"]}
          onChange={setParkingFee}
          hint={labels.parkingNote}
        />
      )}
      <SelectField
        label={labels.pets}
        value={pets}
        options={["No pets", "Dog at property", "Cat at property", "Other pet"]}
        onChange={setPets}
        formatOption={petLabel}
      />
      <BelongingsNotice language={language} context="property" />
      <View style={[styles.field, styles.textAreaField]}>
        <Text style={styles.fieldLabel}>{labels.instructions}</Text>
        <TextInput
          multiline
          numberOfLines={5}
          placeholder={labels.instructionsHint}
          placeholderTextColor="#A1ADBE"
          style={styles.textAreaInput}
          textAlignVertical="top"
        />
      </View>
      <Text style={styles.formSectionTitle}>{labels.photos}</Text>
      <Text style={styles.photoHelp}>{labels.photoHint}</Text>
      <Pressable style={styles.cleanPhotoPicker} onPress={() => pickPhotos()}>
        <View style={styles.photoIcon}>
          <Ionicons name="images-outline" size={24} color={palette.blue} />
        </View>
        <Text style={styles.photoTitle}>{labels.upload}</Text>
        <Text style={styles.photoHint}>{photos.length}/6</Text>
      </Pressable>
      {photos.length > 0 && (
        <View style={styles.cleanPhotoGrid}>
          {photos.map((uri, index) => (
            <Pressable
              key={uri}
              style={styles.cleanPhotoWrap}
              onPress={() =>
                setPhotos(
                  photos.filter((_, photoIndex) => photoIndex !== index),
                )
              }
            >
              <Image source={{ uri }} style={styles.cleanPhoto} />
              <View style={styles.removePhoto}>
                <Ionicons name="close" size={13} color="white" />
              </View>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.cleanSummary}>
        <Ionicons name="document-text-outline" size={20} color={palette.blue} />
        <Text style={styles.cleanSummaryText}>
          {cleanName} · {bedrooms} {labels.bedrooms.toLowerCase()} · {bathrooms}{" "}
          {labels.bathrooms.toLowerCase()} · {kitchens}{" "}
          {labels.kitchens.toLowerCase()} · {livingRooms}{" "}
          {labels.livingRooms.toLowerCase()} ·{" "}
          {formatBookingDate(selectedDay, language)} · {timeSlot}
        </Text>
      </View>
      <Pressable
        style={styles.primaryButton}
        onPress={() => Alert.alert(labels.received, labels.receivedBody)}
      >
        <Text style={styles.primaryButtonText}>{labels.quote}</Text>
      </Pressable>
    </View>
  );
}

function MovingServiceForm({ language }: { language: Language }) {
  const [fromFloor, setFromFloor] = useState("Ground floor");
  const [toFloor, setToFloor] = useState("Ground floor");
  const [fromAccess, setFromAccess] = useState("Lift available");
  const [toAccess, setToAccess] = useState("Lift available");
  const [fromParking, setFromParking] = useState("Free parking available");
  const [toParking, setToParking] = useState("Free parking available");
  const [smallBoxes, setSmallBoxes] = useState(2);
  const [largeBoxes, setLargeBoxes] = useState(2);
  const [suitcases, setSuitcases] = useState(1);
  const [sofas, setSofas] = useState(0);
  const [beds, setBeds] = useState(0);
  const [wardrobes, setWardrobes] = useState(0);
  const [tablesChairs, setTablesChairs] = useState(0);
  const [appliances, setAppliances] = useState(0);
  const [customItems, setCustomItems] = useState(0);
  const [crew, setCrew] = useState<"one" | "two">("one");
  const [selectedDay, setSelectedDay] = useState(() => bookingDateFromToday(7));
  const [timeSlot, setTimeSlot] = useState("09:00–12:00");
  const [photos, setPhotos] = useState<string[]>([]);
  const floors = [
    "Ground floor",
    "1st floor",
    "2nd floor",
    "3rd floor",
    "4th floor",
    "5th floor",
    "6th floor or above",
  ];
  const accessOptions = [
    "Lift available",
    "Stairs only",
    "Lift and stairs",
    "Step-free access",
  ];
  const parkingOptions = [
    "Free parking available",
    "Permit required",
    "Paid street parking",
    "Paid car park nearby",
    "No parking available",
  ];
  const labels = {
    title: tr(
      language,
      "Student Moving Service",
      "学生搬家服务",
      "學生搬屋服務",
    ),
    subtitle: tr(
      language,
      "Reliable help for moving in or moving out.",
      "为入住与退房提供可靠搬运服务。",
      "為入住與退房提供可靠搬運服務。",
    ),
    noPacking: tr(
      language,
      "Moving only — packing and unpacking are not included. Please have all belongings securely packed before the team arrives.",
      "仅提供搬运服务，不包含打包或拆包。请在团队到达前妥善打包所有物品。",
      "只提供搬運服務，不包括打包或拆包。請在團隊到達前妥善打包所有物品。",
    ),
    from: tr(language, "Moving from", "搬出地址", "搬出地址"),
    to: tr(language, "Moving to", "搬入地址", "搬入地址"),
    addressHint: tr(
      language,
      "Full address and postcode",
      "完整地址及邮编",
      "完整地址及郵編",
    ),
    fromAccess: tr(
      language,
      "Collection access",
      "搬出地点通行条件",
      "搬出地點通行條件",
    ),
    toAccess: tr(
      language,
      "Delivery access",
      "搬入地点通行条件",
      "搬入地點通行條件",
    ),
    floor: tr(language, "Floor", "楼层", "樓層"),
    access: tr(language, "Lift or stairs", "电梯或楼梯", "升降機或樓梯"),
    parkingFrom: tr(
      language,
      "Parking at collection",
      "搬出地点停车",
      "搬出地點泊車",
    ),
    parkingTo: tr(
      language,
      "Parking at delivery",
      "搬入地点停车",
      "搬入地點泊車",
    ),
    inventory: tr(
      language,
      "What are you moving?",
      "需要搬运什么？",
      "需要搬運甚麼？",
    ),
    small: tr(language, "Small boxes / bags", "小箱子 / 袋子", "小箱 / 袋"),
    large: tr(language, "Large boxes", "大箱子", "大箱"),
    suitcases: tr(language, "Suitcases", "行李箱", "行李箱"),
    sofas: tr(language, "Sofas", "沙发", "梳化"),
    beds: tr(language, "Beds & mattresses", "床和床垫", "床及床褥"),
    wardrobes: tr(
      language,
      "Wardrobes / drawers",
      "衣柜 / 抽屉柜",
      "衣櫃 / 抽屜櫃",
    ),
    tables: tr(language, "Tables & chairs", "桌子和椅子", "桌及椅"),
    appliances: tr(
      language,
      "Appliances / televisions",
      "家电 / 电视",
      "家電 / 電視",
    ),
    custom: tr(language, "Custom items", "自定义物品", "自訂物品"),
    customName: tr(
      language,
      "Custom item name",
      "自定义物品名称",
      "自訂物品名稱",
    ),
    customNameHint: tr(
      language,
      "For example: keyboard stand",
      "例如：电子琴架",
      "例如：電子琴架",
    ),
    dimensions: tr(
      language,
      "Approximate dimensions or weight",
      "大致尺寸或重量",
      "大約尺寸或重量",
    ),
    dimensionsHint: tr(
      language,
      "For example: 120 × 50 × 70 cm, 20 kg",
      "例如：120 × 50 × 70厘米，20公斤",
      "例如：120 × 50 × 70厘米，20公斤",
    ),
    crew: tr(
      language,
      "Choose your moving team",
      "选择搬运人员",
      "選擇搬運人員",
    ),
    one: tr(language, "1 mover", "1名搬运人员", "1名搬運人員"),
    oneHint: tr(
      language,
      "Best for lighter student moves",
      "适合物品较少的学生搬家",
      "適合物品較少的學生搬屋",
    ),
    two: tr(language, "2 movers", "2名搬运人员", "2名搬運人員"),
    twoHint: tr(
      language,
      "Recommended for stairs or bulky items",
      "楼梯搬运或大型物品时推荐",
      "樓梯搬運或大型物品時建議",
    ),
    date: tr(language, "Moving date", "搬家日期", "搬屋日期"),
    time: tr(language, "Arrival window", "上门时间段", "上門時間段"),
    photos: tr(
      language,
      "Photos of items (optional)",
      "物品照片（可选）",
      "物品相片（可選）",
    ),
    photoHint: tr(
      language,
      "Upload up to 6 photos to help us choose the right van and team.",
      "最多上传6张照片，帮助我们安排合适的车辆和人员。",
      "最多上載6張相片，幫助我們安排合適的車輛和人員。",
    ),
    upload: tr(language, "Add item photos", "添加物品照片", "加入物品相片"),
    details: tr(language, "Extra details", "其他说明", "其他說明"),
    detailsHint: tr(
      language,
      "Tell us about access restrictions, fragile or unusually large items, loading times, or anything else we should know.",
      "请说明门禁限制、易碎或超大物品、装卸时限或其他注意事项。",
      "請說明門禁限制、易碎或超大型物品、裝卸時限或其他注意事項。",
    ),
    quote: tr(language, "Get a moving quote", "获取搬家报价", "獲取搬屋報價"),
    received: tr(
      language,
      "Moving quote requested",
      "已提交搬家报价请求",
      "已提交搬屋報價請求",
    ),
    receivedBody: tr(
      language,
      "Your moving details have been added. We will confirm vehicle size, access, parking costs and final price.",
      "已添加搬家详情。我们会确认车型、通行条件、停车费和最终价格。",
      "已加入搬屋詳情。我們會確認車型、通行條件、泊車費和最終價格。",
    ),
  };
  const floorLabel = (value: string) =>
    ({
      "Ground floor": tr(language, value, "底层", "地下"),
      "1st floor": tr(language, value, "1楼", "1樓"),
      "2nd floor": tr(language, value, "2楼", "2樓"),
      "3rd floor": tr(language, value, "3楼", "3樓"),
      "4th floor": tr(language, value, "4楼", "4樓"),
      "5th floor": tr(language, value, "5楼", "5樓"),
      "6th floor or above": tr(language, value, "6楼或以上", "6樓或以上"),
    })[value] || value;
  const accessLabel = (value: string) =>
    ({
      "Lift available": tr(language, value, "有电梯", "有升降機"),
      "Stairs only": tr(language, value, "仅楼梯", "只有樓梯"),
      "Lift and stairs": tr(language, value, "电梯及楼梯", "升降機及樓梯"),
      "Step-free access": tr(language, value, "无障碍通行", "無障礙通行"),
    })[value] || value;
  const parkingLabel = (value: string) =>
    ({
      "Free parking available": tr(language, value, "可免费停车", "可免費泊車"),
      "Permit required": tr(language, value, "需要停车证", "需要泊車證"),
      "Paid street parking": tr(
        language,
        value,
        "路边收费停车",
        "路邊收費泊車",
      ),
      "Paid car park nearby": tr(
        language,
        value,
        "附近有收费停车场",
        "附近有收費停車場",
      ),
      "No parking available": tr(language, value, "没有停车位", "沒有泊車位"),
    })[value] || value;
  const pickPhotos = async (source?: PhotoSource) => {
    if (!source) {
      askPhotoSource(language, pickPhotos);
      return;
    }
    const uris = await selectPhotoUris(language, source, {
      multiple: source === "library",
      limit: Math.max(1, 6 - photos.length),
      quality: 0.75,
    });
    if (uris.length) setPhotos([...photos, ...uris].slice(0, 6));
  };
  return (
    <View style={styles.formCard}>
      <View style={styles.formHero}>
        <View style={[styles.formHeroIcon, { backgroundColor: "#E7F8F8" }]}>
          <Ionicons name="cube" size={27} color="#00A1A7" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formTitle}>{labels.title}</Text>
          <Text style={styles.formDesc}>{labels.subtitle}</Text>
        </View>
      </View>
      <View style={styles.movingNotice}>
        <Ionicons name="information-circle" size={21} color="#007E84" />
        <Text style={styles.movingNoticeText}>{labels.noPacking}</Text>
      </View>
      <Text style={styles.formSectionTitle}>{labels.from}</Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{labels.from}</Text>
        <TextInput
          placeholder={labels.addressHint}
          placeholderTextColor="#A1ADBE"
        />
      </View>
      <View style={styles.formTwoColumns}>
        <View style={styles.formHalf}>
          <SelectField
            label={labels.floor}
            value={fromFloor}
            options={floors}
            onChange={setFromFloor}
            formatOption={floorLabel}
          />
        </View>
        <View style={styles.formHalf}>
          <SelectField
            label={labels.access}
            value={fromAccess}
            options={accessOptions}
            onChange={setFromAccess}
            formatOption={accessLabel}
          />
        </View>
      </View>
      <SelectField
        label={labels.parkingFrom}
        value={fromParking}
        options={parkingOptions}
        onChange={setFromParking}
        formatOption={parkingLabel}
      />
      <Text style={styles.formSectionTitle}>{labels.to}</Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{labels.to}</Text>
        <TextInput
          placeholder={labels.addressHint}
          placeholderTextColor="#A1ADBE"
        />
      </View>
      <View style={styles.formTwoColumns}>
        <View style={styles.formHalf}>
          <SelectField
            label={labels.floor}
            value={toFloor}
            options={floors}
            onChange={setToFloor}
            formatOption={floorLabel}
          />
        </View>
        <View style={styles.formHalf}>
          <SelectField
            label={labels.access}
            value={toAccess}
            options={accessOptions}
            onChange={setToAccess}
            formatOption={accessLabel}
          />
        </View>
      </View>
      <SelectField
        label={labels.parkingTo}
        value={toParking}
        options={parkingOptions}
        onChange={setToParking}
        formatOption={parkingLabel}
      />
      <Text style={styles.formSectionTitle}>{labels.inventory}</Text>
      <View style={styles.counterCard}>
        <CounterRow
          label={labels.small}
          value={smallBoxes}
          onChange={setSmallBoxes}
        />
        <CounterRow
          label={labels.large}
          value={largeBoxes}
          onChange={setLargeBoxes}
        />
        <CounterRow
          label={labels.suitcases}
          value={suitcases}
          onChange={setSuitcases}
        />
        <CounterRow label={labels.sofas} value={sofas} onChange={setSofas} />
        <CounterRow label={labels.beds} value={beds} onChange={setBeds} />
        <CounterRow
          label={labels.wardrobes}
          value={wardrobes}
          onChange={setWardrobes}
        />
        <CounterRow
          label={labels.tables}
          value={tablesChairs}
          onChange={setTablesChairs}
        />
        <CounterRow
          label={labels.appliances}
          value={appliances}
          onChange={setAppliances}
        />
        <CounterRow
          label={labels.custom}
          value={customItems}
          onChange={setCustomItems}
        />
      </View>
      {customItems > 0 && (
        <View style={styles.customItemsList}>
          {Array.from({ length: customItems }, (_, index) => (
            <View key={`custom-${index}`} style={styles.customItemCard}>
              <View style={styles.customItemHead}>
                <View style={styles.customItemIcon}>
                  <Ionicons
                    name="cube-outline"
                    size={18}
                    color={palette.blue}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customItemTitle}>
                    {tr(
                      language,
                      `Custom item ${index + 1}`,
                      `自定义物品 ${index + 1}`,
                      `自訂物品 ${index + 1}`,
                    )}
                  </Text>
                  <Text style={styles.customItemSubtitle}>
                    {tr(
                      language,
                      "Give us enough detail to choose the right van and handling equipment.",
                      "请提供足够信息，便于我们安排合适车辆和搬运设备。",
                      "請提供足夠資料，方便我們安排合適車輛和搬運設備。",
                    )}
                  </Text>
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{labels.customName}</Text>
                <TextInput
                  placeholder={labels.customNameHint}
                  placeholderTextColor="#A1ADBE"
                />
              </View>
              <Text style={styles.customMeasureLabel}>
                {tr(language, "Estimated dimensions", "预估尺寸", "預估尺寸")}
              </Text>
              <View style={styles.customDimensions}>
                <View style={styles.customDimensionField}>
                  <Text style={styles.customDimensionLabel}>
                    {tr(language, "Length", "长", "長")}
                  </Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#A1ADBE"
                    style={styles.customDimensionInput}
                  />
                </View>
                <View style={styles.customDimensionField}>
                  <Text style={styles.customDimensionLabel}>
                    {tr(language, "Width", "宽", "寬")}
                  </Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#A1ADBE"
                    style={styles.customDimensionInput}
                  />
                </View>
                <View style={styles.customDimensionField}>
                  <Text style={styles.customDimensionLabel}>
                    {tr(language, "Height", "高", "高")}
                  </Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#A1ADBE"
                    style={styles.customDimensionInput}
                  />
                </View>
                <View style={styles.customUnit}>
                  <Text style={styles.customUnitText}>CM</Text>
                </View>
              </View>
              <View style={styles.customWeightRow}>
                <View style={[styles.field, styles.customWeightField]}>
                  <Text style={styles.fieldLabel}>
                    {tr(language, "Estimated weight", "预估重量", "預估重量")}
                  </Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#A1ADBE"
                  />
                </View>
                <View style={styles.customUnit}>
                  <Text style={styles.customUnitText}>KG</Text>
                </View>
              </View>
              <View style={[styles.field, styles.customNotesField]}>
                <Text style={styles.fieldLabel}>
                  {tr(
                    language,
                    "Handling notes (optional)",
                    "搬运注意事项（可选）",
                    "搬運注意事項（可選）",
                  )}
                </Text>
                <TextInput
                  placeholder={tr(
                    language,
                    "Fragile, awkward shape, needs dismantling…",
                    "易碎、形状不规则、需拆卸…",
                    "易碎、形狀不規則、需拆卸…",
                  )}
                  placeholderTextColor="#A1ADBE"
                />
              </View>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.formSectionTitle}>{labels.crew}</Text>
      <View style={styles.crewGrid}>
        {(
          [
            {
              id: "one",
              icon: "person",
              title: labels.one,
              hint: labels.oneHint,
            },
            {
              id: "two",
              icon: "people",
              title: labels.two,
              hint: labels.twoHint,
            },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            style={[
              styles.crewOption,
              crew === item.id && styles.crewOptionActive,
            ]}
            onPress={() => setCrew(item.id)}
          >
            <Ionicons
              name={item.icon}
              size={23}
              color={crew === item.id ? palette.blue : palette.muted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.crewTitle}>{item.title}</Text>
              <Text style={styles.crewHint}>{item.hint}</Text>
            </View>
            {crew === item.id && (
              <Ionicons
                name="checkmark-circle"
                size={19}
                color={palette.blue}
              />
            )}
          </Pressable>
        ))}
      </View>
      <BelongingsNotice language={language} context="move" />
      <Text style={styles.formSectionTitle}>{labels.date}</Text>
      <AvailabilityCalendar
        selected={selectedDay}
        onSelect={setSelectedDay}
        language={language}
        compact
      />
      <SelectField
        label={labels.time}
        value={timeSlot}
        options={["09:00–12:00", "12:00–15:00", "15:00–18:00", "18:00–21:00"]}
        onChange={setTimeSlot}
      />
      <Text style={styles.formSectionTitle}>{labels.photos}</Text>
      <Text style={styles.photoHelp}>{labels.photoHint}</Text>
      <Pressable style={styles.cleanPhotoPicker} onPress={() => pickPhotos()}>
        <View style={styles.photoIcon}>
          <Ionicons name="images-outline" size={24} color={palette.blue} />
        </View>
        <Text style={styles.photoTitle}>{labels.upload}</Text>
        <Text style={styles.photoHint}>{photos.length}/6</Text>
      </Pressable>
      {photos.length > 0 && (
        <View style={styles.cleanPhotoGrid}>
          {photos.map((uri, index) => (
            <Pressable
              key={uri}
              style={styles.cleanPhotoWrap}
              onPress={() =>
                setPhotos(
                  photos.filter((_, photoIndex) => photoIndex !== index),
                )
              }
            >
              <Image source={{ uri }} style={styles.cleanPhoto} />
              <View style={styles.removePhoto}>
                <Ionicons name="close" size={13} color="white" />
              </View>
            </Pressable>
          ))}
        </View>
      )}
      <View style={[styles.field, styles.textAreaField]}>
        <Text style={styles.fieldLabel}>{labels.details}</Text>
        <TextInput
          multiline
          numberOfLines={5}
          placeholder={labels.detailsHint}
          placeholderTextColor="#A1ADBE"
          style={styles.textAreaInput}
          textAlignVertical="top"
        />
      </View>
      <View style={styles.cleanSummary}>
        <Ionicons name="car-sport-outline" size={20} color="#00A1A7" />
        <Text style={styles.cleanSummaryText}>
          {crew === "one" ? labels.one : labels.two} · {smallBoxes}{" "}
          {labels.small.toLowerCase()} · {largeBoxes}{" "}
          {labels.large.toLowerCase()} ·{" "}
          {formatBookingDate(selectedDay, language)} · {timeSlot}
        </Text>
      </View>
      <Pressable
        style={styles.primaryButton}
        onPress={() => Alert.alert(labels.received, labels.receivedBody)}
      >
        <Text style={styles.primaryButtonText}>{labels.quote}</Text>
      </Pressable>
    </View>
  );
}

function ServiceForm({ type, language }: { type: string; language: Language }) {
  if (type === "Airport transfer")
    return <AirportTransferForm language={language} />;
  if (type === "Moving") return <MovingServiceForm language={language} />;
  return <CleaningServiceForm language={language} />;
}

function FoodForum({ language }: { language: Language }) {
  const [mode, setMode] = useState<
    "discover" | "trending" | "friends" | "saved"
  >("discover");
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<string[]>(["Dishoom"]);
  const [selected, setSelected] = useState<(typeof restaurants)[number] | null>(
    null,
  );
  const [reviewPlace, setReviewPlace] = useState<
    (typeof restaurants)[number] | null
  >(null);
  const [rating, setRating] = useState(5);
  const [sentiment, setSentiment] = useState<
    "Loved it" | "It was fine" | "Not for me"
  >("Loved it");
  const [reviewText, setReviewText] = useState("");
  const [favouriteDish, setFavouriteDish] = useState("");
  const [visitDate, setVisitDate] = useState(() => dateKey(new Date()));
  const [reviewPhotos, setReviewPhotos] = useState<string[]>([]);
  const [menuPhotos, setMenuPhotos] = useState<string[]>([]);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [showAllLists, setShowAllLists] = useState(false);
  const filters = [
    "All",
    "Top rated",
    "Italian",
    "Chinese",
    "Thai",
    "Korean",
    "BBQ",
    "Burger",
    "Steak",
    "Indian",
    "Under £20",
    "Friends",
    "Birthday",
    "Family",
    "Date night",
    "Activities",
  ];
  const filtered = restaurants.filter((item) => {
    const searchMatch =
      `${item.name} ${item.area} ${item.category} ${item.occasion} ${item.dish}`
        .toLowerCase()
        .includes(query.toLowerCase());
    const filterMatch =
      filter === "All" ||
      (filter === "Top rated" && Number(item.rating) >= 4.7) ||
      (filter === "Under £20" && item.price === "£") ||
      (filter === "Activities" && item.category === "Activity") ||
      item.category === filter ||
      item.occasion === filter;
    const modeMatch = mode !== "saved" || saved.includes(item.name);
    return searchMatch && filterMatch && modeMatch;
  });
  const toggleSaved = (name: string) =>
    setSaved(
      saved.includes(name)
        ? saved.filter((item) => item !== name)
        : [...saved, name],
    );
  const pickReviewPhotos = async (
    type: "review" | "menu",
    source?: PhotoSource,
  ) => {
    if (!source) {
      askPhotoSource(language, (selectedSource) =>
        pickReviewPhotos(type, selectedSource),
      );
      return;
    }
    const current = type === "review" ? reviewPhotos : menuPhotos;
    const uris = await selectPhotoUris(language, source, {
      multiple: source === "library",
      limit: Math.max(1, 6 - current.length),
      quality: 0.75,
    });
    if (uris.length) {
      const next = [...current, ...uris].slice(0, 6);
      type === "review" ? setReviewPhotos(next) : setMenuPhotos(next);
    }
  };
  const openReview = (place = selected || restaurants[0]) => {
    setReviewPlace(place);
    setSelected(null);
  };
  const closeReview = () => {
    setReviewPlace(null);
    setReviewText("");
    setFavouriteDish("");
    setReviewPhotos([]);
    setMenuPhotos([]);
  };
  const modeOptions = [
    {
      id: "discover",
      icon: "sparkles-outline",
      label: tr(language, "For you", "为你推荐", "為你推介"),
    },
    {
      id: "trending",
      icon: "trending-up-outline",
      label: tr(language, "Trending", "热门", "熱門"),
    },
    {
      id: "friends",
      icon: "people-outline",
      label: tr(language, "Friend picks", "好友推荐", "好友推介"),
    },
    {
      id: "saved",
      icon: "bookmark-outline",
      label: tr(language, "Saved", "已收藏", "已收藏"),
    },
  ] as const;
  const featuredLists = [
    {
      title: tr(language, "Top 10 under £20", "£20以下十佳", "£20以下十佳"),
      image: restaurants[5].image,
      progress: "4 / 10",
      filter: "Under £20",
    },
    {
      title: tr(language, "Best for birthdays", "生日聚会推荐", "生日聚會推介"),
      image: restaurants[4].image,
      progress: "2 / 8",
      filter: "Birthday",
    },
    {
      title: tr(language, "Social activities", "热门社交活动", "熱門社交活動"),
      image: restaurants[6].image,
      progress: "1 / 6",
      filter: "Activities",
    },
    {
      title: tr(language, "Friend favourites", "好友最爱", "好友最愛"),
      image: restaurants[0].image,
      progress: "3 / 10",
      filter: "Friends",
    },
    {
      title: tr(language, "Date-night picks", "约会之夜推荐", "約會之夜推介"),
      image: restaurants[3].image,
      progress: "2 / 10",
      filter: "Date night",
    },
    {
      title: tr(language, "Top student rated", "学生高分榜", "學生高分榜"),
      image: restaurants[1].image,
      progress: "5 / 10",
      filter: "Top rated",
    },
  ];
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>
              {tr(
                language,
                "Restaurants & Activities",
                "餐厅与活动点评",
                "餐廳與活動點評",
              )}
            </Text>
            <Text style={styles.formDesc}>
              {tr(
                language,
                "Student reviews, friend recommendations and affordable London experiences.",
                "学生真实评价、好友推荐和实惠的伦敦体验。",
                "學生真實評價、好友推介及實惠的倫敦體驗。",
              )}
            </Text>
          </View>
          <Pressable style={styles.reviewButton} onPress={() => openReview()}>
            <Ionicons name="add" color="white" />
            <Text style={styles.reviewButtonText}>
              {words[language].addReview}
            </Text>
          </Pressable>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={palette.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={tr(
              language,
              "Search restaurants, cuisine, activities or occasions…",
              "搜索餐厅、菜系、活动或场合…",
              "搜尋餐廳、菜系、活動或場合…",
            )}
            placeholderTextColor="#8B98AD"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.foodModeRow}
        >
          {modeOptions.map((item) => (
            <Pressable
              key={item.id}
              style={[
                styles.foodMode,
                mode === item.id && styles.foodModeActive,
              ]}
              onPress={() => setMode(item.id)}
            >
              <Ionicons
                name={item.icon}
                size={16}
                color={mode === item.id ? "white" : palette.blue}
              />
              <Text
                style={[
                  styles.foodModeText,
                  mode === item.id && styles.foodModeTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroller}
          contentContainerStyle={styles.foodFilterRow}
        >
          {filters.map((item) => (
            <Pressable
              key={item}
              style={[
                styles.categoryChip,
                filter === item && styles.categoryChipActive,
              ]}
              onPress={() => setFilter(item)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  filter === item && styles.categoryChipTextActive,
                ]}
              >
                {item === "All" ? tr(language, "All", "全部", "全部") : item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>
              {tr(
                language,
                "Featured student lists",
                "学生精选榜单",
                "學生精選榜單",
              )}
            </Text>
            <Text style={styles.foodSectionHint}>
              {tr(
                language,
                "Curated from verified student visits",
                "根据已验证的学生到访整理",
                "根據已驗證的學生到訪整理",
              )}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowAllLists(!showAllLists)}
          >
            <Text style={styles.seeAll}>
              {showAllLists
                ? tr(language, "Show less", "收起", "收起")
                : tr(language, "See all", "查看全部", "查看全部")}
            </Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredListRow}
        >
          {featuredLists
            .slice(0, showAllLists ? featuredLists.length : 3)
            .map((item) => (
              <Pressable
                key={item.title}
                style={styles.featuredListCard}
                onPress={() => {
                  setFilter(item.filter);
                  setMode("discover");
                }}
              >
                <Image
                  source={{ uri: item.image }}
                  style={styles.featuredListImage}
                />
                <LinearGradient
                  colors={["transparent", "rgba(3,20,50,.9)"]}
                  style={styles.featuredListShade}
                >
                  <Text style={styles.featuredListTitle}>{item.title}</Text>
                  <Text style={styles.featuredListMeta}>
                    {tr(
                      language,
                      `You've tried ${item.progress}`,
                      `你已体验 ${item.progress}`,
                      `你已體驗 ${item.progress}`,
                    )}
                  </Text>
                </LinearGradient>
              </Pressable>
            ))}
        </ScrollView>
        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>
              {mode === "friends"
                ? tr(
                    language,
                    "Popular with your friends",
                    "好友喜欢的地方",
                    "好友喜歡的地方",
                  )
                : mode === "saved"
                  ? tr(
                      language,
                      "Your saved places",
                      "你收藏的地点",
                      "你收藏的地點",
                    )
                  : filter === "Activities"
                    ? tr(
                        language,
                        "Activities to try",
                        "值得体验的活动",
                        "值得體驗的活動",
                      )
                    : tr(language, "Explore places", "探索地点", "探索地點")}
            </Text>
            <Text style={styles.foodSectionHint}>
              {filtered.length} {tr(language, "matches", "个结果", "個結果")}
            </Text>
          </View>
        </View>
        {filtered.length ? (
          filtered.map((item) => (
            <Pressable
              style={styles.foodCard}
              key={item.name}
              onPress={() => {
                setTranslated(false);
                setSelected(item);
              }}
            >
              <Image source={{ uri: item.image }} style={styles.foodImage} />
              <View style={styles.rating}>
                <Ionicons name="star" size={12} color="white" />
                <Text style={styles.ratingText}>{item.rating}</Text>
              </View>
              <Pressable
                accessibilityLabel={
                  saved.includes(item.name)
                    ? tr(language, "Remove bookmark", "取消收藏", "取消收藏")
                    : tr(language, "Bookmark place", "收藏地点", "收藏地點")
                }
                style={styles.foodBookmark}
                onPress={(event) => {
                  event.stopPropagation?.();
                  toggleSaved(item.name);
                }}
              >
                <Ionicons
                  name={
                    saved.includes(item.name) ? "bookmark" : "bookmark-outline"
                  }
                  size={21}
                  color={
                    saved.includes(item.name) ? palette.coral : palette.navy
                  }
                />
              </Pressable>
              <View style={styles.foodBody}>
                <View style={styles.foodTitleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>{item.name}</Text>
                    <Text style={styles.metaText}>
                      {item.category} · {item.area} · {item.distance} ·{" "}
                      {item.price}
                    </Text>
                  </View>
                  <Text style={styles.reviewCount}>
                    {item.reviews} {tr(language, "reviews", "条点评", "則點評")}
                  </Text>
                </View>
                <Text style={styles.dish}>{item.dish}</Text>
                <Text style={styles.quote}>
                  “{language === "EN" ? item.quote : item.translation}”
                </Text>
                <View style={styles.friendPickLine}>
                  <View style={styles.friendFaceStack}>
                    <View
                      style={[styles.miniFace, { backgroundColor: "#FFDCD0" }]}
                    >
                      <Text style={styles.miniFaceText}>LL</Text>
                    </View>
                    <View
                      style={[
                        styles.miniFace,
                        styles.miniFaceOverlap,
                        { backgroundColor: "#DCEBFF" },
                      ]}
                    >
                      <Text style={styles.miniFaceText}>DP</Text>
                    </View>
                  </View>
                  <Text style={styles.friendPickText}>
                    {tr(
                      language,
                      `Friend score ${item.friendScore} · ${item.occasion}`,
                      `好友评分 ${item.friendScore} · 适合${item.occasion}`,
                      `好友評分 ${item.friendScore} · 適合${item.occasion}`,
                    )}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))
        ) : (
          <View style={styles.marketEmpty}>
            <Ionicons name="search-outline" size={36} color={palette.blue} />
            <Text style={styles.marketEmptyTitle}>
              {tr(
                language,
                "No matching places yet",
                "暂无匹配地点",
                "暫無匹配地點",
              )}
            </Text>
          </View>
        )}
      </ScrollView>
      <Sheet
        visible={!!selected}
        title={selected?.name || ""}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <ScrollView
            contentContainerStyle={styles.foodDetailBody}
            showsVerticalScrollIndicator={false}
          >
            <View>
              <Image
                source={{ uri: selected.image }}
                style={styles.foodDetailHero}
              />
              <Pressable
                style={styles.foodDetailBookmark}
                onPress={() => toggleSaved(selected.name)}
              >
                <Ionicons
                  name={
                    saved.includes(selected.name)
                      ? "bookmark"
                      : "bookmark-outline"
                  }
                  size={22}
                  color={
                    saved.includes(selected.name) ? palette.coral : palette.navy
                  }
                />
              </Pressable>
            </View>
            <Text style={styles.foodDetailTitle}>{selected.name}</Text>
            <Text style={styles.foodDetailMeta}>
              {selected.category} · {selected.area} · {selected.distance} ·{" "}
              {selected.price}
            </Text>
            <View style={styles.placeActions}>
              <Pressable
                style={styles.placeAction}
                onPress={() => Linking.openURL("https://example.com")}
              >
                <Ionicons name="globe-outline" size={18} color={palette.blue} />
                <Text style={styles.placeActionText}>
                  {tr(language, "Website", "网站", "網站")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.placeAction}
                onPress={() => Linking.openURL("tel:+442079460000")}
              >
                <Ionicons name="call-outline" size={18} color={palette.blue} />
                <Text style={styles.placeActionText}>
                  {tr(language, "Call", "电话", "電話")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.placeAction}
                onPress={() =>
                  Linking.openURL(
                    `https://maps.apple.com/?q=${encodeURIComponent(`${selected.name}, ${selected.area}, London`)}`,
                  )
                }
              >
                <Ionicons
                  name="navigate-outline"
                  size={18}
                  color={palette.blue}
                />
                <Text style={styles.placeActionText}>
                  {tr(language, "Directions", "路线", "路線")}
                </Text>
              </Pressable>
            </View>
            <View style={styles.scoreGrid}>
              <View style={styles.scoreCard}>
                <Ionicons name="star" size={20} color="#F2A91B" />
                <Text style={styles.scoreValue}>{selected.rating}</Text>
                <Text style={styles.scoreLabel}>
                  {tr(language, "Student rating", "学生评分", "學生評分")}
                </Text>
              </View>
              <View style={styles.scoreCard}>
                <Ionicons name="people" size={20} color={palette.green} />
                <Text style={styles.scoreValue}>{selected.friendScore}</Text>
                <Text style={styles.scoreLabel}>
                  {tr(language, "Friend score", "好友评分", "好友評分")}
                </Text>
              </View>
              <View style={styles.scoreCard}>
                <Ionicons name="cash-outline" size={20} color={palette.blue} />
                <Text style={styles.scoreValue}>{selected.price}</Text>
                <Text style={styles.scoreLabel}>
                  {tr(language, "Price level", "价格水平", "價格水平")}
                </Text>
              </View>
            </View>
            <Text style={styles.friendSectionTitle}>
              {tr(
                language,
                "Student photos & menu",
                "学生照片与菜单",
                "學生相片與餐牌",
              )}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.foodPhotoRow}
            >
              <Image
                source={{ uri: selected.image }}
                style={styles.foodDetailPhoto}
              />
              <Image
                source={{
                  uri: restaurants[
                    (restaurants.indexOf(selected) + 1) % restaurants.length
                  ].image,
                }}
                style={styles.foodDetailPhoto}
              />
              <Pressable
                style={styles.menuPhotoCard}
                onPress={() => pickReviewPhotos("menu")}
              >
                <Ionicons
                  name="camera-outline"
                  size={24}
                  color={palette.blue}
                />
                <Text style={styles.menuPhotoText}>
                  {tr(
                    language,
                    "Upload menu & prices",
                    "上传菜单与价格",
                    "上載餐牌與價格",
                  )}
                </Text>
              </Pressable>
            </ScrollView>
            <View style={styles.studentReviewCard}>
              <View style={styles.studentReviewHead}>
                <View style={[styles.avatar, { backgroundColor: "#FFDCD0" }]}>
                  <Text style={styles.avatarText}>LL</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.friendName}>@londonlatte</Text>
                  <Text style={styles.metaText}>
                    {tr(
                      language,
                      "Verified student visit · 2 weeks ago",
                      "已验证学生到访 · 2周前",
                      "已驗證學生到訪 · 2週前",
                    )}
                  </Text>
                </View>
                <Text style={styles.reviewStars}>★★★★★</Text>
              </View>
              <Text style={styles.quote}>
                “
                {translated
                  ? language === "EN"
                    ? selected.translation
                    : selected.quote
                  : language === "EN"
                    ? selected.quote
                    : selected.translation}
                ”
              </Text>
              <Pressable
                style={styles.translateButton}
                onPress={() => setTranslated(!translated)}
              >
                <Ionicons
                  name="language-outline"
                  size={16}
                  color={palette.blue}
                />
                <Text style={styles.translateText}>
                  {translated
                    ? tr(language, "Show original", "显示原文", "顯示原文")
                    : tr(
                        language,
                        language === "EN"
                          ? "Translate to Chinese"
                          : "Translate to English",
                        "翻译成英文",
                        "翻譯成英文",
                      )}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.friendSectionTitle}>
              {tr(
                language,
                "What your friends think",
                "你的好友评价",
                "你的好友評價",
              )}
            </Text>
            <View style={styles.friendOpinion}>
              <View style={[styles.avatar, { backgroundColor: "#DCEBFF" }]}>
                <Text style={styles.avatarText}>DP</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>Daniel · 4.8 ★</Text>
                <Text style={styles.friendInterests}>
                  {tr(
                    language,
                    "Great for a relaxed evening with friends.",
                    "很适合和朋友轻松聚会。",
                    "很適合和朋友輕鬆聚會。",
                  )}
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() => openReview(selected)}
            >
              <Text style={styles.primaryButtonText}>
                {tr(
                  language,
                  "Review this place",
                  "评价这个地点",
                  "評價這個地點",
                )}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </Sheet>
      <Sheet
        visible={!!reviewPlace}
        title={tr(
          language,
          "Share your experience",
          "分享你的体验",
          "分享你的體驗",
        )}
        onClose={closeReview}
      >
        {reviewPlace && (
          <ScrollView
            contentContainerStyle={styles.foodReviewBody}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.reviewPlaceHead}>
              <Image
                source={{ uri: reviewPlace.image }}
                style={styles.reviewPlaceImage}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>{reviewPlace.name}</Text>
                <Text style={styles.metaText}>
                  {reviewPlace.category} · {reviewPlace.area}
                </Text>
              </View>
            </View>
            <Text style={styles.friendSectionTitle}>
              {tr(language, "How was it?", "体验如何？", "體驗如何？")}
            </Text>
            <View style={styles.sentimentRow}>
              {[
                { label: "Loved it", icon: "heart", color: "#D9F4E6" },
                { label: "It was fine", icon: "remove", color: "#FFF1C8" },
                { label: "Not for me", icon: "close", color: "#FFE0E2" },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  style={[
                    styles.sentimentOption,
                    { backgroundColor: item.color },
                    sentiment === item.label && styles.sentimentActive,
                  ]}
                  onPress={() => setSentiment(item.label as typeof sentiment)}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={22}
                    color={palette.navy}
                  />
                  <Text style={styles.sentimentText}>
                    {tr(
                      language,
                      item.label,
                      item.label === "Loved it"
                        ? "很喜欢"
                        : item.label === "It was fine"
                          ? "还不错"
                          : "不适合我",
                      item.label === "Loved it"
                        ? "很喜歡"
                        : item.label === "It was fine"
                          ? "還不錯"
                          : "不適合我",
                    )}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.friendSectionTitle}>
              {tr(language, "Your rating", "你的评分", "你的評分")}
            </Text>
            <View style={styles.foodStarRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setRating(star)}>
                  <Ionicons
                    name={star <= rating ? "star" : "star-outline"}
                    size={31}
                    color="#F2A91B"
                  />
                </Pressable>
              ))}
            </View>
            <View style={[styles.field, styles.textAreaField]}>
              <Text style={styles.fieldLabel}>
                {tr(
                  language,
                  "Review in English or Chinese",
                  "用中文或英文写评价",
                  "用中文或英文撰寫評價",
                )}
              </Text>
              <TextInput
                multiline
                style={styles.textAreaInput}
                value={reviewText}
                onChangeText={setReviewText}
                placeholder={tr(
                  language,
                  "Service, atmosphere, accessibility and useful tips…",
                  "服务、氛围、无障碍和实用建议…",
                  "服務、氣氛、無障礙及實用建議…",
                )}
                placeholderTextColor="#A1ADBE"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                {tr(
                  language,
                  reviewPlace.category === "Activity"
                    ? "Favourite moment"
                    : "Favourite dishes",
                  reviewPlace.category === "Activity"
                    ? "最喜欢的环节"
                    : "推荐菜品",
                  reviewPlace.category === "Activity"
                    ? "最喜歡的環節"
                    : "推介菜式",
                )}
              </Text>
              <TextInput
                value={favouriteDish}
                onChangeText={setFavouriteDish}
                placeholder={
                  reviewPlace.category === "Activity"
                    ? "Painting and glazing"
                    : "Black daal, roast duck…"
                }
                placeholderTextColor="#A1ADBE"
              />
            </View>
            <VisitDateDropdown
              selected={visitDate}
              onSelect={setVisitDate}
              language={language}
            />
            <View style={styles.reviewUploadGrid}>
              <Pressable
                style={styles.reviewUpload}
                onPress={() => pickReviewPhotos("review")}
              >
                <Ionicons
                  name="images-outline"
                  size={23}
                  color={palette.blue}
                />
                <Text style={styles.reviewUploadTitle}>
                  {tr(language, "Visit photos", "到访照片", "到訪相片")}
                </Text>
                <Text style={styles.reviewUploadMeta}>
                  {reviewPhotos.length}/6
                </Text>
              </Pressable>
              <Pressable
                style={styles.reviewUpload}
                onPress={() => pickReviewPhotos("menu")}
              >
                <Ionicons
                  name="receipt-outline"
                  size={23}
                  color={palette.blue}
                />
                <Text style={styles.reviewUploadTitle}>
                  {tr(language, "Menu & prices", "菜单与价格", "餐牌與價格")}
                </Text>
                <Text style={styles.reviewUploadMeta}>
                  {menuPhotos.length}/6
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.reviewPrivacy}
              onPress={() => setFriendsOnly(!friendsOnly)}
            >
              <Ionicons
                name={friendsOnly ? "lock-closed" : "people"}
                size={21}
                color={palette.green}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.supportOptionTitle}>
                  {tr(
                    language,
                    "Review visibility",
                    "评价可见范围",
                    "評價可見範圍",
                  )}
                </Text>
                <Text style={styles.supportOptionText}>
                  {friendsOnly
                    ? tr(
                        language,
                        "Only accepted friends can see this on your profile.",
                        "仅已接受的好友可在你的资料中查看。",
                        "只有已接受的好友可在你的資料中查看。",
                      )
                    : tr(
                        language,
                        "Visible to the student community and on your profile.",
                        "学生社区可见，并会显示在你的资料中。",
                        "學生社群可見，並會顯示在你的資料中。",
                      )}
                </Text>
              </View>
              <Ionicons
                name={friendsOnly ? "toggle" : "toggle-outline"}
                size={34}
                color={friendsOnly ? palette.green : palette.muted}
              />
            </Pressable>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                Alert.alert(
                  tr(language, "Review submitted", "评价已提交", "評價已提交"),
                  tr(
                    language,
                    "Your review will appear on the place page and your profile using your chosen visibility.",
                    "评价将按你选择的可见范围显示在地点页面和你的资料中。",
                    "評價將按你選擇的可見範圍顯示在地點頁面及你的資料中。",
                  ),
                );
                closeReview();
              }}
            >
              <Text style={styles.primaryButtonText}>
                {tr(language, "Publish review", "发布评价", "發佈評價")}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </Sheet>
    </>
  );
}

function Marketplace({
  language,
  onSell,
}: {
  language: Language;
  onSell: () => void;
}) {
  const [category, setCategory] = useState("All products");
  const [selected, setSelected] = useState<(typeof products)[number] | null>(
    null,
  );
  const names =
    language === "EN"
      ? products.map((item) => item.name)
      : language === "简体"
        ? [
            "空气炸锅",
            "电热水壶",
            "书桌椅",
            "学习台灯",
            "电饭煲",
            "厨房入门套装",
            "蓝牙音箱",
            "床头柜",
            "餐盘与餐具套装",
            "发夹套装",
            "课程教材套装",
            "折叠晾衣架",
          ]
        : [
            "空氣炸鍋",
            "電熱水壺",
            "書桌椅",
            "學習檯燈",
            "電飯煲",
            "廚房入門套裝",
            "藍牙喇叭",
            "床頭櫃",
            "餐碟及餐具套裝",
            "髮夾套裝",
            "課程教材套裝",
            "折疊晾衣架",
          ];
  const categories = [
    "All products",
    "Kitchen",
    "Electronics",
    "Furniture",
    "Homeware",
    "Books",
    "Study supplies",
    "Clothing",
    "Accessories",
    "Sports & leisure",
    "Daily needs",
  ];
  const categoryLabel = (value: string) =>
    ({
      "All products": tr(language, value, "全部商品", "全部商品"),
      Kitchen: tr(language, value, "厨房与餐饮", "廚房及餐飲"),
      Electronics: tr(language, value, "电子产品", "電子產品"),
      Furniture: tr(language, value, "家具", "傢私"),
      Homeware: tr(language, value, "家居用品", "家居用品"),
      Books: tr(language, value, "书籍", "書籍"),
      "Study supplies": tr(language, value, "学习用品", "學習用品"),
      Clothing: tr(language, value, "衣物", "衣物"),
      Accessories: tr(language, value, "配饰", "飾物"),
      "Sports & leisure": tr(language, value, "运动与休闲", "運動及休閒"),
      "Daily needs": tr(language, value, "日常用品", "日常用品"),
    })[value] || value;
  const conditionLabel = (value: string) =>
    ({
      New: tr(language, value, "全新", "全新"),
      "Opened — never used": tr(
        language,
        value,
        "已开封但未使用",
        "已開封但未使用",
      ),
      Used: tr(language, value, "有使用痕迹", "有使用痕跡"),
      "Like new": tr(language, value, "近乎全新", "近乎全新"),
      "Minor damage": tr(language, value, "轻微损坏", "輕微損壞"),
    })[value] || value;
  const shownProducts =
    category === "All products"
      ? products
      : products.filter((item) => item.category === category);
  const selectedIndex = selected ? products.indexOf(selected) : -1;
  const selectedName = selectedIndex >= 0 ? names[selectedIndex] : "";
  const roughLocations = [
    "Bloomsbury",
    "Camden",
    "Stratford",
    "South Kensington",
  ];
  const productSize = !selected
    ? ""
    : selected.category === "Furniture"
      ? "50 × 55 × 80 cm"
      : selected.category === "Books"
        ? tr(
            language,
            "A4 bundle · approx. 6 cm spine",
            "A4教材套装 · 书脊约6厘米",
            "A4教材套裝 · 書脊約6厘米",
          )
        : selected.category === "Accessories"
          ? tr(language, "Not applicable", "不适用", "不適用")
          : "Approx. 30 × 30 × 35 cm";
  const handover =
    selectedIndex % 3 === 0
      ? tr(language, "Collection only", "仅限自取", "只限自取")
      : tr(
          language,
          "UNIMATE delivery or collection",
          "UNIMATE配送或自取",
          "UNIMATE配送或自取",
        );
  return (
    <>
      <ScrollView contentContainerStyle={styles.modalBody}>
        <View style={styles.marketHero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>{words[language].market}</Text>
            <Text style={styles.formDesc}>
              {tr(
                language,
                "Affordable second-hand essentials for student life.",
                "面向学生的平价二手生活用品。",
                "面向學生的平價二手生活用品。",
              )}
            </Text>
          </View>
          <Pressable style={styles.sellButton} onPress={onSell}>
            <Ionicons name="add" color="white" />
            <Text style={styles.sellButtonText}>{words[language].sell}</Text>
          </Pressable>
        </View>
        <Search
          placeholder={tr(
            language,
            "Search products…",
            "搜索商品…",
            "搜尋商品…",
          )}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.marketCategoryScroller}
          contentContainerStyle={styles.marketCategoryRow}
        >
          {categories.map((item) => (
            <Pressable
              key={item}
              style={[
                styles.marketCategory,
                category === item && styles.marketCategoryActive,
              ]}
              onPress={() => setCategory(item)}
            >
              <Text
                style={[
                  styles.marketCategoryText,
                  category === item && styles.marketCategoryTextActive,
                ]}
              >
                {categoryLabel(item)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {shownProducts.length > 0 ? (
          <View style={styles.productGrid}>
            {shownProducts.map((item) => {
              const index = products.indexOf(item);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr(
                    language,
                    "View " + item.name + " details",
                    "查看" + names[index] + "详情",
                    "查看" + names[index] + "詳情",
                  )}
                  style={styles.productCard}
                  key={item.name}
                  onPress={() => setSelected(item)}
                >
                  <Image
                    source={{ uri: item.image }}
                    style={styles.productImage}
                  />
                  <View style={styles.productBody}>
                    <Text style={styles.productName}>{names[index]}</Text>
                    <View style={styles.productConditionPill}>
                      <Text style={styles.productCondition}>
                        {conditionLabel(item.condition)}
                      </Text>
                    </View>
                    <Text style={styles.productPrice}>{item.price}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.marketEmpty}>
            <Ionicons name="cube-outline" size={30} color={palette.muted} />
            <Text style={styles.marketEmptyTitle}>
              {tr(
                language,
                "No listings in this category yet",
                "该分类暂无商品",
                "這個分類暫無商品",
              )}
            </Text>
            <Text style={styles.formDesc}>
              {tr(
                language,
                "New student listings will appear here after review.",
                "新商品审核通过后会显示在这里。",
                "新商品審核通過後會顯示在這裡。",
              )}
            </Text>
          </View>
        )}
      </ScrollView>
      <Sheet
        visible={!!selected}
        title={selectedName || words[language].market}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <ScrollView
            contentContainerStyle={styles.productDetailBody}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={{ uri: selected.image }}
              style={styles.productDetailImage}
            />
            <View style={styles.productDetailHeadline}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productDetailName}>{selectedName}</Text>
                <View style={styles.productConditionPill}>
                  <Text style={styles.productCondition}>
                    {conditionLabel(selected.condition)}
                  </Text>
                </View>
              </View>
              <Text style={styles.productDetailPrice}>{selected.price}</Text>
            </View>
            <View style={styles.productFacts}>
              <View style={styles.productFact}>
                <Text style={styles.productFactLabel}>
                  {tr(language, "CATEGORY", "分类", "分類")}
                </Text>
                <Text style={styles.productFactValue}>
                  {categoryLabel(selected.category)}
                </Text>
              </View>
              <View style={styles.productFact}>
                <Text style={styles.productFactLabel}>
                  {tr(language, "QUANTITY", "数量", "數量")}
                </Text>
                <Text style={styles.productFactValue}>1</Text>
              </View>
              <View style={styles.productFact}>
                <Text style={styles.productFactLabel}>
                  {tr(language, "SIZE", "尺寸", "尺寸")}
                </Text>
                <Text style={styles.productFactValue}>{productSize}</Text>
              </View>
            </View>
            <Text style={styles.formSectionTitle}>
              {tr(language, "Item description", "物品描述", "物品描述")}
            </Text>
            <Text style={styles.productDescription}>
              {tr(
                language,
                "A practical second-hand item in the stated condition. The seller has supplied an accurate condition check and clear photo.",
                "实用的二手物品。卖家已提供准确的状况说明和清晰照片。",
                "實用的二手物品。賣家已提供準確的狀況說明及清晰相片。",
              )}
            </Text>
            <View style={styles.handoverCard}>
              <View style={styles.handoverIcon}>
                <Ionicons
                  name={
                    selectedIndex % 3 === 0 ? "location-outline" : "car-outline"
                  }
                  size={22}
                  color={palette.blue}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.handoverTitle}>{handover}</Text>
                <Text style={styles.handoverText}>
                  {tr(
                    language,
                    "Seller area: " +
                      roughLocations[selectedIndex % roughLocations.length] +
                      ". Exact collection address is revealed only after purchase.",
                    "卖家大致区域：" +
                      roughLocations[selectedIndex % roughLocations.length] +
                      "。完整取货地址仅在购买后显示。",
                    "賣家大致區域：" +
                      roughLocations[selectedIndex % roughLocations.length] +
                      "。完整取貨地址只在購買後顯示。",
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.productSeller}>
              <View style={styles.productSellerAvatar}>
                <Text style={styles.productSellerInitial}>M</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.productSellerName}>@movingout_mia</Text>
                <Text style={styles.formDesc}>
                  {tr(
                    language,
                    "Verified student seller · member since 2025",
                    "已验证学生卖家 · 2025年加入",
                    "已驗證學生賣家 · 2025年加入",
                  )}
                </Text>
              </View>
              <Ionicons
                name="shield-checkmark"
                size={20}
                color={palette.green}
              />
            </View>
            <View style={styles.productDetailActions}>
              <Pressable
                style={styles.productMessageButton}
                onPress={() =>
                  Alert.alert(
                    tr(language, "Message seller", "联系卖家", "聯絡賣家"),
                  )
                }
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={18}
                  color={palette.blue}
                />
                <Text style={styles.productMessageText}>
                  {tr(language, "Message", "消息", "訊息")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, styles.productBuyButton]}
                onPress={() =>
                  Alert.alert(
                    tr(language, "Ready to purchase", "准备购买", "準備購買"),
                    tr(
                      language,
                      "Checkout will confirm collection or UNIMATE delivery.",
                      "结账时将确认自取或UNIMATE配送。",
                      "結帳時將確認自取或UNIMATE配送。",
                    ),
                  )
                }
              >
                <Text style={styles.primaryButtonText}>
                  {tr(language, "Buy now", "立即购买", "立即購買")}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </Sheet>
    </>
  );
}

function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHead}>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={28} color={palette.ink} />
          </Pressable>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={{ width: 28 }} />
        </View>
        {children}
      </SafeAreaView>
    </Modal>
  );
}

function SellItemForm({
  visible,
  language,
  onClose,
}: {
  visible: boolean;
  language: Language;
  onClose: () => void;
}) {
  const [category, setCategory] = useState("Daily needs");
  const [condition, setCondition] = useState("Like new");
  const [quantity, setQuantity] = useState(1);
  const [originalPrice, setOriginalPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [delivery, setDelivery] = useState<"delivery" | "collection">(
    "collection",
  );
  const [itemName, setItemName] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [damage, setDamage] = useState("");
  const [address, setAddress] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const categoryLabel = (value: string) =>
    ({
      Kitchen: tr(language, value, "厨房与餐饮", "廚房及餐飲"),
      Electronics: tr(language, value, "电子产品", "電子產品"),
      Furniture: tr(language, value, "家具", "傢私"),
      Homeware: tr(language, value, "家居用品", "家居用品"),
      Books: tr(language, value, "书籍", "書籍"),
      "Study supplies": tr(language, value, "学习用品", "學習用品"),
      Clothing: tr(language, value, "衣物", "衣物"),
      Accessories: tr(language, value, "配饰", "飾物"),
      "Sports & leisure": tr(language, value, "运动与休闲", "運動及休閒"),
      "Daily needs": tr(language, value, "日常用品", "日常用品"),
    })[value] || value;
  const conditionLabel = (value: string) =>
    ({
      New: tr(language, value, "全新", "全新"),
      "Opened — never used": tr(
        language,
        value,
        "已开封但未使用",
        "已開封但未使用",
      ),
      "Like new": tr(language, value, "近乎全新", "近乎全新"),
      Used: tr(language, value, "有使用痕迹", "有使用痕跡"),
      "Minor damage": tr(language, value, "轻微损坏", "輕微損壞"),
    })[value] || value;
  const multipliers: Record<string, [number, number]> = {
    New: [0.55, 0.75],
    "Opened — never used": [0.48, 0.68],
    "Like new": [0.4, 0.6],
    Used: [0.2, 0.45],
    "Minor damage": [0.1, 0.3],
  };
  const original = Number(originalPrice) || 0;
  const selling = Number(sellingPrice) || 0;
  const range = multipliers[condition];
  const low = original * range[0];
  const high = original * range[1];
  const cautionHigh = high * 1.2;
  const fair =
    original > 0 && selling > 0
      ? selling <= high
        ? "good"
        : selling <= cautionHigh
          ? "caution"
          : "overpriced"
      : null;
  const fairLabel =
    fair === "good"
      ? tr(language, "Good student price", "价格合理", "價格合理")
      : fair === "caution"
        ? tr(language, "Slightly overpriced", "价格略高", "價格略高")
        : tr(language, "Overpriced", "价格过高", "價格過高");
  const payout = selling * 0.85;
  const scalePosition = Math.max(
    4,
    Math.min(
      96,
      original > 0 ? (selling / Math.max(cautionHigh * 1.25, 1)) * 100 : 4,
    ),
  );
  const valid =
    itemName.trim() &&
    description.trim() &&
    photos.length > 0 &&
    original > 0 &&
    selling > 0 &&
    address.trim() &&
    (condition !== "Minor damage" || damage.trim());
  const pickPhotos = async (source?: PhotoSource) => {
    if (!source) {
      askPhotoSource(language, pickPhotos);
      return;
    }
    const uris = await selectPhotoUris(language, source, {
      multiple: source === "library",
      limit: Math.max(1, 6 - photos.length),
      quality: 0.75,
    });
    if (uris.length) setPhotos([...photos, ...uris].slice(0, 6));
  };
  return (
    <Sheet visible={visible} title={words[language].sell} onClose={onClose}>
      <ScrollView
        contentContainerStyle={styles.modalBody}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.commission}>
          <Ionicons name="information-circle" size={21} color={palette.blue} />
          <Text style={styles.noticeText}>{words[language].commission}</Text>
        </View>
        <View style={styles.marketRules}>
          <Ionicons name="shield-checkmark" size={21} color={palette.green} />
          <Text style={styles.marketRulesText}>
            {tr(
              language,
              "For affordable second-hand student essentials only. Beauty, makeup, opened hygiene products, luxury, unsafe or unusually high-value items are not accepted; listings over £250 require review.",
              "仅限平价学生二手用品。不接受美妆、开封的个人卫生用品、奢侈品、不安全或价格过高的物品；超过£250的商品需审核。",
              "只限平價學生二手用品。不接受美妝、已開封的個人衛生用品、奢侈品、不安全或價格過高的物品；超過£250的商品需審核。",
            )}
          </Text>
        </View>
        <SelectField
          label={tr(language, "Product category", "商品类别", "商品類別")}
          value={category}
          options={[
            "Kitchen",
            "Electronics",
            "Furniture",
            "Homeware",
            "Books",
            "Study supplies",
            "Clothing",
            "Accessories",
            "Sports & leisure",
            "Daily needs",
          ]}
          onChange={setCategory}
          formatOption={categoryLabel}
        />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            {tr(language, "Item name", "物品名称", "物品名稱")}
          </Text>
          <TextInput
            value={itemName}
            onChangeText={setItemName}
            placeholder={tr(
              language,
              "e.g. compact desk lamp",
              "例如：小型学习台灯",
              "例如：小型學習檯燈",
            )}
            placeholderTextColor="#A1ADBE"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            {tr(language, "Brand (optional)", "品牌（可选）", "品牌（可選）")}
          </Text>
          <TextInput
            value={brand}
            onChangeText={setBrand}
            placeholder={tr(
              language,
              "Brand or manufacturer",
              "品牌或制造商",
              "品牌或製造商",
            )}
            placeholderTextColor="#A1ADBE"
          />
        </View>
        <CounterRow
          label={tr(language, "Quantity", "数量", "數量")}
          value={quantity}
          onChange={(value) => setQuantity(Math.max(1, value))}
        />
        <SelectField
          label={tr(language, "Item condition", "物品状况", "物品狀況")}
          value={condition}
          options={[
            "New",
            "Opened — never used",
            "Like new",
            "Used",
            "Minor damage",
          ]}
          onChange={setCondition}
          formatOption={conditionLabel}
        />
        {condition === "Minor damage" && (
          <View style={[styles.field, styles.textAreaField]}>
            <Text style={styles.fieldLabel}>
              {tr(
                language,
                "Describe the damage",
                "请描述损坏情况",
                "請描述損壞情況",
              )}
            </Text>
            <TextInput
              value={damage}
              onChangeText={setDamage}
              multiline
              numberOfLines={4}
              style={styles.textAreaInput}
              placeholder={tr(
                language,
                "Explain every scratch, fault or missing part clearly.",
                "请清楚说明所有划痕、故障或缺少的部件。",
                "請清楚說明所有刮痕、故障或缺少的部件。",
              )}
              placeholderTextColor="#A1ADBE"
            />
          </View>
        )}
        <View style={[styles.field, styles.textAreaField]}>
          <Text style={styles.fieldLabel}>
            {tr(language, "Item description", "物品描述", "物品描述")}
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            style={styles.textAreaInput}
            placeholder={tr(
              language,
              "Describe age, use, included accessories and why you are selling.",
              "说明购买时间、使用情况、包含的配件及出售原因。",
              "說明購買時間、使用情況、包括的配件及出售原因。",
            )}
            placeholderTextColor="#A1ADBE"
          />
        </View>
        <Text style={styles.formSectionTitle}>
          {tr(language, "Product photos", "商品照片", "商品相片")}
        </Text>
        <Text style={styles.photoHelp}>
          {tr(
            language,
            "Upload 1 to 6 clear photos. Include every side and any marks or damage.",
            "上传1至6张清晰照片，请展示物品各个角度及任何磨损。",
            "上載1至6張清晰相片，請展示物品各個角度及任何磨損。",
          )}
        </Text>
        <Pressable style={styles.cleanPhotoPicker} onPress={() => pickPhotos()}>
          <View style={styles.photoIcon}>
            <Ionicons name="images-outline" size={24} color={palette.blue} />
          </View>
          <Text style={styles.photoTitle}>
            {tr(language, "Add product photos", "添加商品照片", "加入商品相片")}
          </Text>
          <Text style={styles.photoHint}>{photos.length}/6</Text>
        </Pressable>
        {photos.length > 0 && (
          <View style={styles.cleanPhotoGrid}>
            {photos.map((uri, index) => (
              <Pressable
                key={uri}
                style={styles.cleanPhotoWrap}
                onPress={() =>
                  setPhotos(
                    photos.filter((_, photoIndex) => photoIndex !== index),
                  )
                }
              >
                <Image source={{ uri }} style={styles.cleanPhoto} />
                <View style={styles.removePhoto}>
                  <Ionicons name="close" size={13} color="white" />
                </View>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={styles.formSectionTitle}>
          {tr(language, "Fair price check", "合理价格检测", "合理價格檢測")}
        </Text>
        <View style={styles.formTwoColumns}>
          <View style={styles.formHalf}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                {tr(language, "Original price", "原价", "原價")}
              </Text>
              <TextInput
                value={originalPrice}
                onChangeText={setOriginalPrice}
                keyboardType="decimal-pad"
                placeholder="£0.00"
                placeholderTextColor="#A1ADBE"
              />
            </View>
          </View>
          <View style={styles.formHalf}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                {tr(language, "Your price", "售价", "售價")}
              </Text>
              <TextInput
                value={sellingPrice}
                onChangeText={setSellingPrice}
                keyboardType="decimal-pad"
                placeholder="£0.00"
                placeholderTextColor="#A1ADBE"
              />
            </View>
          </View>
        </View>
        {original > 0 && (
          <View
            style={[
              styles.fairPriceCard,
              fair === "caution" && styles.fairPriceCaution,
              fair === "overpriced" && styles.fairPriceHigh,
            ]}
          >
            <View style={styles.fairPriceHead}>
              <Ionicons
                name="speedometer-outline"
                size={20}
                color={
                  fair === "overpriced"
                    ? palette.coral
                    : fair === "caution"
                      ? "#D89A00"
                      : palette.green
                }
              />
              <Text
                style={[
                  styles.fairPriceTitle,
                  fair === "caution" && { color: "#9A6A00" },
                  fair === "overpriced" && { color: palette.coral },
                ]}
              >
                {fair
                  ? fairLabel
                  : tr(
                      language,
                      "Fair price guide",
                      "合理价格指南",
                      "合理價格指南",
                    )}
              </Text>
            </View>
            <Text style={styles.fairPriceRange}>
              {tr(
                language,
                "Suggested second-hand range",
                "建议二手价格范围",
                "建議二手價格範圍",
              )}
              : £{low.toFixed(0)}–£{high.toFixed(0)}
            </Text>
            {selling > 0 && (
              <View style={styles.priceScaleWrap}>
                <View style={styles.priceMarkerRow}>
                  <View
                    style={[
                      styles.priceMarker,
                      { left: (scalePosition + "%") as any },
                    ]}
                  >
                    <Text style={styles.priceMarkerText}>
                      £{selling.toFixed(0)}
                    </Text>
                    <Ionicons
                      name="caret-down"
                      size={14}
                      color={palette.navy}
                    />
                  </View>
                </View>
                <View style={styles.priceScale}>
                  <View
                    style={[
                      styles.priceScaleSegment,
                      { backgroundColor: "#2CB66D" },
                    ]}
                  />
                  <View
                    style={[
                      styles.priceScaleSegment,
                      { backgroundColor: "#F2B94B" },
                    ]}
                  />
                  <View
                    style={[
                      styles.priceScaleSegment,
                      { backgroundColor: "#FF5A68" },
                    ]}
                  />
                </View>
                <View style={styles.priceLegend}>
                  <Text style={styles.priceLegendText}>
                    {tr(language, "Good price", "合理", "合理")}
                  </Text>
                  <Text style={styles.priceLegendText}>
                    {tr(language, "Slightly high", "略高", "略高")}
                  </Text>
                  <Text style={styles.priceLegendText}>
                    {tr(language, "Overpriced", "过高", "過高")}
                  </Text>
                </View>
              </View>
            )}
            <Text style={styles.fairPriceHint}>
              {tr(
                language,
                "The guide uses item condition and original price. Similar live listings can be added to the production model.",
                "指南依据物品状况和原价；正式版本可加入类似实时商品数据。",
                "指南依據物品狀況及原價；正式版本可加入類似實時商品數據。",
              )}
            </Text>
          </View>
        )}
        <Text style={styles.formSectionTitle}>
          {tr(language, "Handover method", "交付方式", "交收方式")}
        </Text>
        <View style={styles.deliveryOptions}>
          <Pressable
            style={[
              styles.deliveryOption,
              delivery === "collection" && styles.deliveryOptionActive,
            ]}
            onPress={() => setDelivery("collection")}
          >
            <Ionicons
              name="location-outline"
              size={22}
              color={delivery === "collection" ? palette.blue : palette.muted}
            />
            <Text style={styles.deliveryTitle}>
              {tr(language, "Buyer collection", "买家自取", "買家自取")}
            </Text>
            <Text style={styles.deliveryHint}>
              {tr(language, "No delivery fee", "无需配送费", "無需配送費")}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.deliveryOption,
              delivery === "delivery" && styles.deliveryOptionActive,
            ]}
            onPress={() => setDelivery("delivery")}
          >
            <Ionicons
              name="car-outline"
              size={22}
              color={delivery === "delivery" ? palette.blue : palette.muted}
            />
            <Text style={styles.deliveryTitle}>
              {tr(language, "UNIMATE delivery", "UNIMATE配送", "UNIMATE配送")}
            </Text>
            <Text style={styles.deliveryHint}>
              {tr(
                language,
                "Estimated fee £6.50",
                "预计费用£6.50",
                "預計費用£6.50",
              )}
            </Text>
          </Pressable>
        </View>
        {selling > 0 && (
          <View style={styles.sellerPayoutCard}>
            <View style={styles.payoutHead}>
              <Ionicons name="wallet-outline" size={21} color={palette.green} />
              <Text style={styles.payoutTitle}>
                {tr(
                  language,
                  "What you will receive",
                  "你的预计收入",
                  "你的預計收入",
                )}
              </Text>
            </View>
            <View style={styles.payoutLine}>
              <Text style={styles.payoutLabel}>
                {tr(language, "Sale price", "售价", "售價")}
              </Text>
              <Text style={styles.payoutValue}>£{selling.toFixed(2)}</Text>
            </View>
            <View style={styles.payoutLine}>
              <Text style={styles.payoutLabel}>
                {tr(
                  language,
                  "UNIMATE commission (15%)",
                  "UNIMATE佣金（15%）",
                  "UNIMATE佣金（15%）",
                )}
              </Text>
              <Text style={styles.payoutFee}>
                −£{(selling * 0.15).toFixed(2)}
              </Text>
            </View>
            <View style={styles.payoutTotal}>
              <Text style={styles.payoutTotalLabel}>
                {tr(
                  language,
                  "Your payout after sale",
                  "售出后你将获得",
                  "售出後你將獲得",
                )}
              </Text>
              <Text style={styles.payoutTotalValue}>£{payout.toFixed(2)}</Text>
            </View>
            <Text style={styles.payoutHint}>
              {delivery === "delivery"
                ? tr(
                    language,
                    "The buyer pays the separate UNIMATE delivery fee.",
                    "UNIMATE配送费由买家另行支付。",
                    "UNIMATE配送費由買家另行支付。",
                  )
                : tr(
                    language,
                    "Buyer collection has no delivery fee.",
                    "买家自取不收配送费。",
                    "買家自取不收配送費。",
                  )}
            </Text>
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            {delivery === "collection"
              ? tr(
                  language,
                  "Private collection address",
                  "私人取货地址",
                  "私人取貨地址",
                )
              : tr(
                  language,
                  "Seller pickup address",
                  "卖家取货地址",
                  "賣家取貨地址",
                )}
          </Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder={tr(
              language,
              "Full address and postcode",
              "完整地址及邮编",
              "完整地址及郵編",
            )}
            placeholderTextColor="#A1ADBE"
          />
        </View>
        <View style={styles.addressPrivacy}>
          <Ionicons name="lock-closed" size={17} color={palette.blue} />
          <Text style={styles.addressPrivacyText}>
            {tr(
              language,
              "The exact address stays hidden and is shared only with the buyer after purchase, or with the assigned UNIMATE delivery team.",
              "完整地址将保持隐藏，仅在购买后向买家公开，或提供给指定的UNIMATE配送团队。",
              "完整地址將保持隱藏，只在購買後向買家公開，或提供給指定的UNIMATE配送團隊。",
            )}
          </Text>
        </View>
        <Pressable
          disabled={!valid}
          style={[styles.primaryButton, !valid && { opacity: 0.45 }]}
          onPress={() =>
            Alert.alert(
              tr(
                language,
                "Listing sent to UNIMATE admin",
                "商品已发送给UNIMATE管理员",
                "商品已發送給UNIMATE管理員",
              ),
              tr(
                language,
                "Your item is not live yet. The admin team will review its condition, price and safety details, then publish it if approved.",
                "商品尚未公开。管理员将审核物品状况、价格及安全信息，批准后才会发布。",
                "商品尚未公開。管理員將審核物品狀況、價格及安全資料，批准後才會發佈。",
              ),
            )
          }
        >
          <Text style={styles.primaryButtonText}>
            {tr(
              language,
              "Share listing for approval",
              "提交商品等待审核",
              "提交商品等待審核",
            )}
          </Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

type NotificationFilter = "activity" | "following" | "favourites";

function NotificationCenter({
  language,
  favourites,
  onViewTicket,
  onViewEvent,
  onViewMyEvents,
}: {
  language: Language;
  favourites: string[];
  onViewTicket: () => void;
  onViewEvent: (eventTitle: string) => void;
  onViewMyEvents: () => void;
}) {
  const [filter, setFilter] = useState<NotificationFilter>("activity");
  const labels =
    language === "EN"
      ? {
          activity: "Activity",
          following: "Following",
          favourites: "Favourites",
          new: "NEW",
          today: "TODAY",
          earlier: "EARLIER",
        }
      : language === "简体"
        ? {
            activity: "动态",
            following: "已关注",
            favourites: "已收藏",
            new: "新消息",
            today: "今天",
            earlier: "较早",
          }
        : {
            activity: "動態",
            following: "已關注",
            favourites: "已收藏",
            new: "新訊息",
            today: "今天",
            earlier: "較早",
          };
  const items = [
    {
      id: "event-published",
      date: labels.today,
      kind: "activity",
      icon: "checkmark-circle",
      color: "#20B868",
      title: tr(
        language,
        "Your event is approved and live",
        "你的活动已通过审核并上线",
        "你的活動已通過審核並上線",
      ),
      body: tr(
        language,
        "Your event has passed the UNIMATE safety review and is now published. You can manage it, view attendees and share it from My events.",
        "你的活动已通过 UNIMATE 安全审核并正式发布。你可以在“我的活动”中管理活动、查看参加者并分享。",
        "你的活動已通過 UNIMATE 安全審核並正式發佈。你可以在「我的活動」中管理活動、查看參加者及分享。",
      ),
      time: tr(language, "Just now", "刚刚", "剛剛"),
      action: tr(language, "View my events", "查看我的活动", "查看我的活動"),
      actionType: "my-events",
    },
    {
      id: "ticket",
      date: labels.today,
      kind: "activity",
      icon: "ticket",
      color: "#0878E6",
      title: tr(
        language,
        "Your ticket is ready",
        "你的电子票已准备好",
        "你的電子票已準備好",
      ),
      body: tr(
        language,
        "Your Thames River Cruise ticket is available. Keep the QR pass ready at entry.",
        "泰晤士河游船电子票已可查看，入场时请准备二维码。",
        "泰晤士河遊船電子票已可查看，入場時請準備二維碼。",
      ),
      time: tr(language, "2 min", "2分钟前", "2分鐘前"),
      action: tr(language, "View ticket", "查看电子票", "查看電子票"),
      actionType: "ticket",
    },
    {
      id: "airport",
      date: labels.today,
      kind: "activity",
      icon: "airplane",
      color: "#17A957",
      title: tr(
        language,
        "Airport transfer confirmed",
        "机场接送已确认",
        "機場接送已確認",
      ),
      body: tr(
        language,
        "Your pickup is booked. Driver details and live arrival updates will appear in My Bookings.",
        "你的接机服务已预订，司机资料及到达更新将显示在“我的预订”。",
        "你的接機服務已預訂，司機資料及到達更新將顯示於「我的預訂」。",
      ),
      time: tr(language, "18 min", "18分钟前", "18分鐘前"),
      action: tr(language, "View booking", "查看预订", "查看預訂"),
      actionType: "booking",
    },
    {
      id: "cleaning",
      date: labels.today,
      kind: "activity",
      icon: "sparkles",
      color: "#F28A18",
      title: tr(
        language,
        "Cleaning service booked",
        "保洁服务已预订",
        "清潔服務已預訂",
      ),
      body: tr(
        language,
        "Your end-of-tenancy clean is confirmed. We will remind you 24 hours before arrival.",
        "你的退租清洁已确认，我们会在上门前24小时提醒你。",
        "你的退租清潔已確認，我們會在上門前24小時提醒你。",
      ),
      time: tr(language, "42 min", "42分钟前", "42分鐘前"),
      action: tr(language, "View booking", "查看预订", "查看預訂"),
      actionType: "booking",
    },
    {
      id: "follow",
      date: labels.today,
      kind: "following",
      icon: "calendar",
      color: "#7542C8",
      title: tr(language, "Event reminder", "活动提醒", "活動提醒"),
      body: tr(
        language,
        "Outdoor Movie Night starts this Saturday. The organiser has posted an arrival update.",
        "户外电影之夜将于本周六开始，主办方已发布到场通知。",
        "戶外電影之夜將於本週六開始，主辦方已發佈到場通知。",
      ),
      time: tr(language, "1 hr", "1小时前", "1小時前"),
    },
    {
      id: "favourite",
      date: labels.earlier,
      kind: "favourites",
      icon: "heart",
      color: "#FF5360",
      title: tr(
        language,
        "Tickets running low",
        "门票即将售罄",
        "門票即將售罄",
      ),
      body: tr(
        language,
        "Thames River Cruise now has only 12 advance tickets remaining.",
        "泰晤士河游船目前仅剩12张预售票。",
        "泰晤士河遊船目前僅剩12張預售票。",
      ),
      time: tr(language, "3 hr", "3小时前", "3小時前"),
      action: tr(language, "View event", "查看活动", "查看活動"),
      actionType: "event",
      eventTitle: "Thames River Cruise",
    },
    {
      id: "friend",
      date: labels.earlier,
      kind: "activity",
      icon: "person-add",
      color: "#23B866",
      title: tr(
        language,
        "Friend request accepted",
        "好友请求已接受",
        "好友請求已接受",
      ),
      body: tr(
        language,
        "@danplays accepted your friend request. You can now see the profile details they chose to share.",
        "@danplays 已接受你的好友请求，现在可查看对方向好友公开的资料。",
        "@danplays 已接受你的好友請求，現在可查看對方向好友公開的資料。",
      ),
      time: tr(language, "Yesterday", "昨天", "昨天"),
    },
  ];
  const favouriteNotifications = favourites.map((eventTitle) => ({
    id: `saved-${eventTitle}`,
    date: labels.earlier,
    kind: "favourites",
    icon: "heart",
    color: "#FF5360",
    title: tr(language, "Saved to favourites", "已收藏活动", "已收藏活動"),
    body: tr(
      language,
      `${eventTitle} is in your favourites. We will notify you about availability and event updates.`,
      `${eventTitle} 已加入收藏。我们会提醒你名额及活动更新。`,
      `${eventTitle} 已加入收藏。我們會提醒你名額及活動更新。`,
    ),
    time: tr(language, "Saved", "已收藏", "已收藏"),
    action: tr(language, "View event", "查看活动", "查看活動"),
    actionType: "event",
    eventTitle,
  }));
  const allItems: any[] = [
    ...items.filter((item) => item.kind !== "favourites"),
    ...favouriteNotifications,
  ];
  const visible =
    filter === "activity"
      ? allItems
      : allItems.filter((item) => item.kind === filter);
  return (
    <ScrollView
      contentContainerStyle={styles.notificationBody}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.notificationIntro}>
        <View style={styles.notificationIntroIcon}>
          <Ionicons name="notifications" size={22} color={palette.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formTitle}>
            {language === "EN"
              ? "Keep up with UNIMATE"
              : "掌握 UNIMATE 最新動態"}
          </Text>
          <Text style={styles.formDesc}>
            {language === "EN"
              ? "Tickets, bookings, friends and changes to events you follow or save."
              : "查看電子票、服務預訂、好友及活動的最新消息。"}
          </Text>
        </View>
      </View>
      <View style={styles.notificationFilters}>
        {(["activity", "following", "favourites"] as NotificationFilter[]).map(
          (item) => (
            <Pressable
              key={item}
              style={[
                styles.notificationFilter,
                filter === item && styles.notificationFilterActive,
              ]}
              onPress={() => setFilter(item)}
            >
              <Text
                style={[
                  styles.notificationFilterText,
                  filter === item && styles.notificationFilterTextActive,
                ]}
              >
                {labels[item]}
              </Text>
            </Pressable>
          ),
        )}
      </View>
      {visible.map((item, index) => (
        <React.Fragment key={item.id}>
          {(index === 0 || visible[index - 1]?.date !== item.date) && (
            <Text style={styles.notificationDate}>{item.date}</Text>
          )}
          <View style={styles.notificationCard}>
            <View style={styles.notificationIconWrap}>
              <View
                style={[
                  styles.notificationIcon,
                  { backgroundColor: item.color + "16" },
                ]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={21}
                  color={item.color}
                />
              </View>
              <View style={styles.unreadDot} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.notificationTitleRow}>
                <Text style={styles.notificationTitle}>{item.title}</Text>
                <Text style={styles.notificationTime}>{item.time}</Text>
              </View>
              <Text style={styles.notificationText}>{item.body}</Text>
              {item.action && (
                <Pressable
                  style={styles.ticketAction}
                  onPress={() =>
                    item.actionType === "ticket"
                      ? onViewTicket()
                      : item.actionType === "my-events"
                        ? onViewMyEvents()
                      : item.actionType === "event"
                        ? onViewEvent(item.eventTitle || "Thames River Cruise")
                        : Alert.alert(
                            item.title,
                            tr(
                              language,
                              "This opens the booking details and live status in the production app.",
                              "正式版本将在此打开预订详情与实时状态。",
                              "正式版本將在此開啟預訂詳情與即時狀態。",
                            ),
                          )
                  }
                >
                  <Text style={styles.ticketActionText}>{item.action}</Text>
                  <Ionicons name="chevron-forward" size={14} color="white" />
                </Pressable>
              )}
            </View>
          </View>
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

function TicketPass({
  visible,
  onClose,
  language,
}: {
  visible: boolean;
  onClose: () => void;
  language: Language;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.ticketPassScreen}>
        <View style={styles.ticketPassHead}>
          <Pressable
            accessibilityLabel={tr(
              language,
              "Close ticket",
              "关闭电子票",
              "關閉電子票",
            )}
            style={styles.ticketPassClose}
            onPress={onClose}
          >
            <Ionicons name="close" size={26} color="white" />
          </Pressable>
          <Text style={styles.ticketPassHeadTitle}>
            {tr(language, "My ticket", "我的电子票", "我的電子票")}
          </Text>
          <Pressable
            accessibilityLabel={tr(
              language,
              "Share ticket",
              "分享电子票",
              "分享電子票",
            )}
            style={styles.ticketPassClose}
            onPress={() =>
              Alert.alert(
                tr(language, "Share ticket", "分享电子票", "分享電子票"),
                tr(
                  language,
                  "Secure ticket sharing will be available in the production app.",
                  "正式版本将提供安全的电子票分享功能。",
                  "正式版本將提供安全的電子票分享功能。",
                ),
              )
            }
          >
            <Ionicons name="share-outline" size={23} color="white" />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.ticketPassBody}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["#0878E6", "#0B4EB4", "#08265F"]}
            style={styles.ticketPassHero}
          >
            <View style={styles.ticketPassBrand}>
              <View style={styles.ticketPassMark}>
                <Text style={styles.ticketPassMarkText}>U</Text>
              </View>
              <Text style={styles.ticketPassBrandText}>
                UNIMATE {tr(language, "TICKETS", "电子票", "電子票")}
              </Text>
            </View>
            <Text style={styles.ticketPassEvent}>
              {tr(
                language,
                "Thames River Cruise",
                "泰晤士河游船",
                "泰晤士河遊船",
              )}
            </Text>
            <Text style={styles.ticketPassAdmit}>
              {tr(
                language,
                "ADMITS ONE · STUDENT ENTRY",
                "单人入场 · 学生票",
                "單人入場 · 學生票",
              )}
            </Text>
          </LinearGradient>
          <View style={styles.ticketPassCard}>
            <View style={styles.qrFrame}>
              <QRCode
                value="UNIMATE-DEMO-TICKET-UM-2026-000184"
                size={220}
                color={palette.navy}
                backgroundColor="#FFFFFF"
              />
            </View>
            <Text style={styles.ticketCode}>UM-2026-000184</Text>
            <Text style={styles.ticketDemo}>
              {tr(
                language,
                "DEMO TICKET · NOT VALID FOR ENTRY",
                "演示电子票 · 不可用于入场",
                "示範電子票 · 不可用於入場",
              )}
            </Text>
            <View style={styles.ticketDivider} />
            <View style={styles.ticketInfoGrid}>
              <View style={styles.ticketInfo}>
                <Text style={styles.ticketInfoLabel}>
                  {tr(language, "DATE", "日期", "日期")}
                </Text>
                <Text style={styles.ticketInfoValue}>
                  {tr(
                    language,
                    "Sat, 12 Apr",
                    "4月12日，周六",
                    "4月12日，週六",
                  )}
                </Text>
              </View>
              <View style={styles.ticketInfo}>
                <Text style={styles.ticketInfoLabel}>
                  {tr(language, "TIME", "时间", "時間")}
                </Text>
                <Text style={styles.ticketInfoValue}>14:00</Text>
              </View>
              <View style={styles.ticketInfo}>
                <Text style={styles.ticketInfoLabel}>
                  {tr(language, "LOCATION", "地点", "地點")}
                </Text>
                <Text style={styles.ticketInfoValue}>
                  {tr(language, "London Eye Pier", "伦敦眼码头", "倫敦眼碼頭")}
                </Text>
              </View>
              <View style={styles.ticketInfo}>
                <Text style={styles.ticketInfoLabel}>
                  {tr(language, "TICKET", "票种", "票種")}
                </Text>
                <Text style={styles.ticketInfoValue}>
                  {tr(language, "General admission", "普通票", "普通票")}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.ticketSecurity}>
            <Ionicons name="shield-checkmark" size={21} color="#A9D6FF" />
            <Text style={styles.ticketSecurityText}>
              {tr(
                language,
                "For the production app, each ticket will use a secure, backend-issued code that can be checked in only once.",
                "正式版本中，每张电子票将使用后端签发的安全码，且只能签到一次。",
                "正式版本中，每張電子票將使用後端簽發的安全碼，且只能簽到一次。",
              )}
            </Text>
          </View>
          <Pressable
            style={styles.walletButton}
            onPress={() =>
              Alert.alert(
                tr(language, "Add to wallet", "添加到钱包", "加入錢包"),
                tr(
                  language,
                  "Apple Wallet and Google Wallet support will be connected in the production app.",
                  "正式版本将支持 Apple Wallet 和 Google Wallet。",
                  "正式版本將支援 Apple Wallet 和 Google Wallet。",
                ),
              )
            }
          >
            <Ionicons name="wallet-outline" size={20} color={palette.navy} />
            <Text style={styles.walletButtonText}>
              {tr(language, "Add to wallet", "添加到钱包", "加入錢包")}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

type BookingSupportItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  status: string;
  statusLabel: string;
  price: string;
  icon: string;
  color: string;
};

function SupportRequestFlow({
  kind,
  booking,
  language,
  onBack,
  onComplete,
}: {
  kind: "change" | "complaint" | "refund";
  booking: BookingSupportItem;
  language: Language;
  onBack: () => void;
  onComplete: () => void;
}) {
  const [changeType, setChangeType] = useState<
    "schedule" | "address" | "details"
  >("schedule");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const isChange = kind === "change";
  const isComplaint = kind === "complaint";
  const title = isChange
    ? tr(language, "Change booking details", "更改预订详情", "更改預訂詳情")
    : isComplaint
      ? tr(
          language,
          "Report a problem or complain",
          "报告问题或投诉",
          "報告問題或投訴",
        )
      : tr(language, "Request a refund", "申请退款", "申請退款");
  const reasons = isComplaint
    ? [
        tr(language, "Service quality", "服务质量", "服務質素"),
        tr(language, "Staff behaviour", "员工行为", "員工行為"),
        tr(language, "Damage", "物品损坏", "物品損壞"),
        tr(language, "Event issue", "活动问题", "活動問題"),
        tr(language, "Other", "其他", "其他"),
      ]
    : [
        tr(language, "Service cancelled", "服务已取消", "服務已取消"),
        tr(language, "Service not provided", "未提供服务", "未提供服務"),
        tr(language, "Duplicate payment", "重复付款", "重複付款"),
        tr(language, "Booking problem", "预订问题", "預訂問題"),
        tr(language, "Other", "其他", "其他"),
      ];
  const submit = () => {
    const reference = `${isComplaint ? "CMP" : kind === "refund" ? "RFD" : "CHG"}-${Math.floor(100000 + Math.random() * 900000)}`;
    Alert.alert(
      tr(language, "Request received", "申请已收到", "申請已收到"),
      tr(
        language,
        `Reference ${reference}. We have attached ${booking.title} and will send updates in Messages.`,
        `参考编号 ${reference}。系统已附上${booking.title}，后续进度将通过消息发送。`,
        `參考編號 ${reference}。系統已附上${booking.title}，後續進度將透過訊息發送。`,
      ),
    );
    onComplete();
  };
  return (
    <View>
      <Pressable style={styles.supportBack} onPress={onBack}>
        <Ionicons name="arrow-back" size={18} color={palette.blue} />
        <Text style={styles.supportBackText}>
          {tr(language, "Booking support", "预订支持", "預訂支援")}
        </Text>
      </Pressable>
      <Text style={styles.supportFlowTitle}>{title}</Text>
      <Text style={styles.supportFlowSubtitle}>
        {booking.title} · {booking.detail}
      </Text>
      {isChange ? (
        <>
          <View style={styles.supportRuleCard}>
            <Ionicons name="time-outline" size={22} color="#9A6800" />
            <Text style={styles.supportRuleText}>
              {tr(
                language,
                "Date or time changes close 48 hours before the booking. Addresses and service details can be added or changed until 24 hours before.",
                "预订前48小时停止更改日期或时间；地址和服务详情可在预订前24小时添加或更改。",
                "預訂前48小時停止更改日期或時間；地址及服務詳情可在預訂前24小時加入或更改。",
              )}
            </Text>
          </View>
          <Text style={styles.formSectionTitle}>
            {tr(
              language,
              "What would you like to change?",
              "你想更改什么？",
              "你想更改甚麼？",
            )}
          </Text>
          <View style={styles.supportChoiceGrid}>
            {(
              [
                {
                  id: "schedule",
                  icon: "calendar-outline",
                  label: tr(
                    language,
                    "Date or time",
                    "日期或时间",
                    "日期或時間",
                  ),
                },
                {
                  id: "address",
                  icon: "location-outline",
                  label: tr(language, "Address", "地址", "地址"),
                },
                {
                  id: "details",
                  icon: "options-outline",
                  label: tr(
                    language,
                    "Service details",
                    "服务详情",
                    "服務詳情",
                  ),
                },
              ] as const
            ).map((item) => (
              <Pressable
                key={item.id}
                style={[
                  styles.supportChoice,
                  changeType === item.id && styles.supportChoiceActive,
                ]}
                onPress={() => setChangeType(item.id)}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={changeType === item.id ? palette.blue : palette.muted}
                />
                <Text
                  style={[
                    styles.supportChoiceText,
                    changeType === item.id && styles.supportChoiceTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.field, styles.textAreaField]}>
            <Text style={styles.fieldLabel}>
              {changeType === "schedule"
                ? tr(
                    language,
                    "Requested date and time",
                    "希望更改为的日期和时间",
                    "希望更改為的日期及時間",
                  )
                : changeType === "address"
                  ? tr(
                      language,
                      "New address and access notes",
                      "新地址与进入说明",
                      "新地址及進入說明",
                    )
                  : tr(
                      language,
                      "Details to add or change",
                      "需要添加或更改的详情",
                      "需要加入或更改的詳情",
                    )}
            </Text>
            <TextInput
              multiline
              value={description}
              onChangeText={setDescription}
              style={styles.textAreaInput}
              placeholder={tr(
                language,
                "Describe the requested change…",
                "请描述希望更改的内容…",
                "請描述希望更改的內容…",
              )}
              placeholderTextColor="#A1ADBE"
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.supportInfoCard}>
            <Ionicons
              name={isComplaint ? "shield-checkmark-outline" : "cash-outline"}
              size={22}
              color={palette.blue}
            />
            <Text style={styles.supportInfoText}>
              {isComplaint
                ? tr(
                    language,
                    "The selected purchase and reference are attached automatically. Add clear details and any evidence so the team can investigate.",
                    "系统会自动附上所选购买记录及编号。请提供清楚说明和相关证据，方便团队调查。",
                    "系統會自動附上所選購買記錄及編號。請提供清楚說明及相關證據，方便團隊調查。",
                  )
                : tr(
                    language,
                    `We will review eligibility for the ${booking.price} payment. Submitting this form does not guarantee approval.`,
                    `我们将审核金额为 ${booking.price} 的付款是否符合退款条件。提交申请并不代表一定获批。`,
                    `我們將審核金額為 ${booking.price} 的付款是否符合退款條件。提交申請並不代表一定獲批。`,
                  )}
            </Text>
          </View>
          <Text style={styles.formSectionTitle}>
            {tr(language, "Select a reason", "选择原因", "選擇原因")}
          </Text>
          <View style={styles.supportReasonWrap}>
            {reasons.map((item) => (
              <Pressable
                key={item}
                style={[
                  styles.supportReasonChip,
                  reason === item && styles.supportReasonChipActive,
                ]}
                onPress={() => setReason(item)}
              >
                <Text
                  style={[
                    styles.supportReasonText,
                    reason === item && styles.supportReasonTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.field, styles.textAreaField]}>
            <Text style={styles.fieldLabel}>
              {isComplaint
                ? tr(language, "What happened?", "发生了什么？", "發生了甚麼？")
                : tr(
                    language,
                    "Why are you requesting a refund?",
                    "为什么申请退款？",
                    "為甚麼申請退款？",
                  )}
            </Text>
            <TextInput
              multiline
              value={description}
              onChangeText={setDescription}
              style={styles.textAreaInput}
              placeholder={tr(
                language,
                "Include dates, people involved and useful details…",
                "请包括日期、相关人员和有用详情…",
                "請包括日期、相關人員及有用詳情…",
              )}
              placeholderTextColor="#A1ADBE"
            />
          </View>
          <Pressable
            style={styles.supportEvidence}
            onPress={() =>
              Alert.alert(
                tr(language, "Add evidence", "添加证据", "加入證據"),
                tr(
                  language,
                  "Photo and document upload will open here.",
                  "此处将打开照片和文件上传。",
                  "此處將開啟相片及文件上載。",
                ),
              )
            }
          >
            <Ionicons name="attach-outline" size={21} color={palette.blue} />
            <Text style={styles.supportEvidenceText}>
              {tr(
                language,
                "Add photos or documents",
                "添加照片或文件",
                "加入相片或文件",
              )}
            </Text>
            <Ionicons name="add" size={18} color={palette.blue} />
          </Pressable>
          {kind === "refund" && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledged }}
              style={styles.supportAcknowledge}
              onPress={() => setAcknowledged(!acknowledged)}
            >
              <View
                style={[styles.checkbox, acknowledged && styles.checkboxActive]}
              >
                {acknowledged && (
                  <Ionicons name="checkmark" size={16} color="white" />
                )}
              </View>
              <Text style={styles.supportAcknowledgeText}>
                {tr(
                  language,
                  "I understand eligibility and processing time depend on the provider, event terms and payment method.",
                  "我了解退款资格和处理时间取决于服务提供者、活动条款和付款方式。",
                  "我了解退款資格及處理時間取決於服務提供者、活動條款及付款方式。",
                )}
              </Text>
            </Pressable>
          )}
        </>
      )}
      <Pressable
        disabled={
          !description.trim() ||
          (!isChange && !reason) ||
          (kind === "refund" && !acknowledged)
        }
        style={[
          styles.primaryButton,
          (!description.trim() ||
            (!isChange && !reason) ||
            (kind === "refund" && !acknowledged)) && { opacity: 0.45 },
        ]}
        onPress={submit}
      >
        <Text style={styles.primaryButtonText}>
          {isChange
            ? tr(
                language,
                "Submit change request",
                "提交更改申请",
                "提交更改申請",
              )
            : isComplaint
              ? tr(language, "Submit complaint", "提交投诉", "提交投訴")
              : tr(
                  language,
                  "Submit refund request",
                  "提交退款申请",
                  "提交退款申請",
                )}
        </Text>
      </Pressable>
    </View>
  );
}

function BookingsPage({
  language,
  onOpenMessages,
  onOpenEvent,
}: {
  language: Language;
  onOpenMessages: (thread: "support" | "lost") => void;
  onOpenEvent: (eventTitle: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "upcoming" | "completed">("all");
  const [supportBooking, setSupportBooking] =
    useState<BookingSupportItem | null>(null);
  const [supportFlow, setSupportFlow] = useState<
    "change" | "complaint" | "refund" | null
  >(null);
  const [rating, setRating] = useState(0);
  const [satisfaction, setSatisfaction] = useState("");
  const labels = {
    title: tr(language, "Purchases & Bookings", "购买与预订", "購買與預訂"),
    search: tr(
      language,
      "Search orders and bookings…",
      "搜索订单与预订…",
      "搜尋訂單與預訂…",
    ),
    all: tr(language, "All", "全部", "全部"),
    upcoming: tr(language, "Upcoming", "即将开始", "即將開始"),
    completed: tr(language, "Completed", "已完成", "已完成"),
    details: tr(language, "View details", "查看详情", "查看詳情"),
    support: tr(language, "Get help", "联系客服", "聯絡客服"),
  };
  const bookings = [
    {
      id: "event",
      type: tr(language, "Event ticket", "活动门票", "活動門票"),
      title: tr(
        language,
        "Thames River Cruise",
        "泰晤士河游船",
        "泰晤士河遊船",
      ),
      detail: tr(
        language,
        "1 ticket · 12 April · 14:00",
        "1张票 · 4月12日 · 14:00",
        "1張票 · 4月12日 · 14:00",
      ),
      status: "upcoming",
      statusLabel: tr(language, "Ticket ready", "电子票已就绪", "電子票已就緒"),
      price: "£27.50",
      icon: "ticket",
      color: "#0878E6",
    },
    {
      id: "airport",
      type: tr(language, "Airport transfer", "机场接送", "機場接送"),
      title: tr(
        language,
        "Heathrow pickup",
        "希思罗机场接机",
        "希斯路機場接機",
      ),
      detail: tr(
        language,
        "Terminal 2 · 18 October · 18:36",
        "2号航站楼 · 10月18日 · 18:36",
        "2號航站樓 · 10月18日 · 18:36",
      ),
      status: "upcoming",
      statusLabel: tr(language, "Deposit paid", "订金已付", "訂金已付"),
      price: "£58.12",
      icon: "airplane",
      color: "#17A957",
    },
    {
      id: "clean",
      type: tr(language, "Cleaning service", "保洁服务", "清潔服務"),
      title: tr(language, "End-of-tenancy clean", "退租清洁", "退租清潔"),
      detail: tr(
        language,
        "1 bedroom · 22 October · 09:00",
        "1间卧室 · 10月22日 · 09:00",
        "1間睡房 · 10月22日 · 09:00",
      ),
      status: "upcoming",
      statusLabel: tr(language, "Confirmed", "已确认", "已確認"),
      price: "£96.00",
      icon: "sparkles",
      color: "#F28A18",
    },
    {
      id: "move",
      type: tr(language, "Student move", "学生搬家", "學生搬屋"),
      title: tr(language, "Move-in service", "入住搬家服务", "入住搬屋服務"),
      detail: tr(
        language,
        "1 mover · 26 October · 12:00",
        "1名搬运人员 · 10月26日 · 12:00",
        "1名搬運人員 · 10月26日 · 12:00",
      ),
      status: "upcoming",
      statusLabel: tr(language, "Quote approved", "报价已确认", "報價已確認"),
      price: "£84.00",
      icon: "cube",
      color: "#00A1A7",
    },
    {
      id: "market",
      type: tr(
        language,
        "Marketplace purchase",
        "二手市场购买",
        "二手市場購買",
      ),
      title: tr(language, "Study lamp", "学习台灯", "學習檯燈"),
      detail: tr(
        language,
        "Collected · Order UM-1048",
        "已取货 · 订单 UM-1048",
        "已取貨 · 訂單 UM-1048",
      ),
      status: "completed",
      statusLabel: tr(language, "Completed", "已完成", "已完成"),
      price: "£8.00",
      icon: "bag-handle",
      color: "#713CE0",
    },
  ];
  const [detailBooking, setDetailBooking] = useState<(typeof bookings)[number] | null>(null);
  const visible =
    filter === "all"
      ? bookings
      : bookings.filter((item) => item.status === filter);
  const supportOptions = [
    {
      icon: "chatbubbles-outline",
      title: tr(
        language,
        "Speak to a team member",
        "联系团队成员",
        "聯絡團隊成員",
      ),
      text: tr(
        language,
        "Ask UniBot a quick question or request a real technician.",
        "先向 UniBot 查询常见问题，或要求联系真人技术人员。",
        "先向 UniBot 查詢常見問題，或要求聯絡真人技術人員。",
      ),
      action: "chat",
    },
    ...(["airport", "clean", "move"].includes(supportBooking?.id || "")
      ? [
          {
            icon: "create-outline",
            title: tr(
              language,
              "Change booking details",
              "更改预订详情",
              "更改預訂詳情",
            ),
            text: tr(
              language,
              "Schedule changes close at 48 hours; service details close at 24 hours.",
              "日期时间需提前48小时更改；服务详情需提前24小时更改。",
              "日期時間需提前48小時更改；服務詳情需提前24小時更改。",
            ),
            action: "change",
          },
        ]
      : []),
    {
      icon: "briefcase-outline",
      title: tr(
        language,
        "Report a lost or found item",
        "报告遗失或拾获物品",
        "報告遺失或拾獲物品",
      ),
      text: tr(
        language,
        "Describe the item, create a claim and receive reference updates.",
        "描述物品、创建失物申报并接收编号与进度。",
        "描述物品、建立失物申報並接收編號及進度。",
      ),
      action: "lost-property",
    },
    {
      icon: "alert-circle-outline",
      title: tr(
        language,
        "Report a problem or complain",
        "报告问题或投诉",
        "報告問題或投訴",
      ),
      text: tr(
        language,
        "Tell our support team what happened and add evidence.",
        "向客服说明情况并添加相关凭证。",
        "向客服說明情況並加入相關憑證。",
      ),
      action: "complaint",
    },
    {
      icon: "cash-outline",
      title: tr(language, "Request a refund", "申请退款", "申請退款"),
      text: tr(
        language,
        "Check eligibility and send a refund request for review.",
        "查看退款资格并提交审核。",
        "查看退款資格並提交審核。",
      ),
      action: "refund",
    },
  ];
  const runSupportAction = (action: string) => {
    if (action === "chat" || action === "lost-property") {
      setSupportBooking(null);
      onOpenMessages(action === "chat" ? "support" : "lost");
      return;
    }
    setSupportFlow(action as "change" | "complaint" | "refund");
  };
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>{labels.title}</Text>
        <Search placeholder={labels.search} />
        <View style={styles.bookingFilters}>
          {(["all", "upcoming", "completed"] as const).map((item) => (
            <Pressable
              key={item}
              style={[
                styles.bookingFilter,
                filter === item && styles.bookingFilterActive,
              ]}
              onPress={() => setFilter(item)}
            >
              <Text
                style={[
                  styles.bookingFilterText,
                  filter === item && styles.bookingFilterTextActive,
                ]}
              >
                {labels[item]}
              </Text>
            </Pressable>
          ))}
        </View>
        {visible.map((item) => (
          <View key={item.id} style={styles.bookingCard}>
            <View style={styles.bookingHead}>
              <View
                style={[
                  styles.bookingIcon,
                  { backgroundColor: item.color + "16" },
                ]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={21}
                  color={item.color}
                />
              </View>
              <Text style={styles.bookingType}>{item.type}</Text>
              <Text style={[styles.bookingStatus, { color: item.color }]}>
                {item.statusLabel}
              </Text>
            </View>
            <View style={styles.bookingMain}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bookingTitle}>{item.title}</Text>
                <Text style={styles.bookingDetail}>{item.detail}</Text>
              </View>
              <Text style={styles.bookingPrice}>{item.price}</Text>
            </View>
            <View style={styles.bookingActions}>
              <Pressable
                style={styles.bookingTextAction}
                onPress={() => {
                  setSupportBooking(item);
                  setRating(0);
                  setSatisfaction("");
                }}
              >
                <Text style={styles.bookingTextActionLabel}>
                  {labels.support}
                </Text>
              </Pressable>
              <Pressable
                style={styles.bookingPrimaryAction}
                onPress={() => item.id === "event" ? onOpenEvent("Thames River Cruise") : setDetailBooking(item)}
              >
                <Text style={styles.bookingPrimaryActionLabel}>
                  {labels.details}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
      <Sheet visible={detailBooking !== null} title={tr(language, "Booking details", "预订详情", "預訂詳情")} onClose={() => setDetailBooking(null)}>{detailBooking && <ScrollView contentContainerStyle={styles.bookingDetailSheet} showsVerticalScrollIndicator={false}><View style={styles.bookingDetailHero}><View style={[styles.bookingDetailHeroIcon, { backgroundColor: detailBooking.color + "18" }]}><Ionicons name={detailBooking.icon as any} size={28} color={detailBooking.color} /></View><View style={{ flex: 1 }}><Text style={styles.bookingDetailType}>{detailBooking.type}</Text><Text style={styles.bookingDetailTitle}>{detailBooking.title}</Text><Text style={styles.bookingDetailStatus}>{detailBooking.statusLabel}</Text></View><Text style={styles.bookingDetailPrice}>{detailBooking.price}</Text></View><View style={styles.bookingDetailFacts}><View style={styles.bookingDetailFact}><Ionicons name="calendar-outline" size={18} color={palette.blue} /><View><Text style={styles.detailLabel}>{tr(language, "Schedule", "日期与时间", "日期及時間")}</Text><Text style={styles.detailValue}>{detailBooking.detail}</Text></View></View>{detailBooking.id === "airport" && <><View style={styles.bookingDetailFact}><Ionicons name="airplane-outline" size={18} color={palette.green} /><View><Text style={styles.detailLabel}>{tr(language, "Flight", "航班", "航班")}</Text><Text style={styles.detailValue}>BA 2836 · Terminal 2</Text></View></View><View style={styles.bookingDetailFact}><Ionicons name="location-outline" size={18} color={palette.coral} /><View><Text style={styles.detailLabel}>{tr(language, "Destination", "目的地", "目的地")}</Text><Text style={styles.detailValue}>UCL, Bloomsbury, London</Text></View></View></>}{detailBooking.id === "clean" && <><View style={styles.bookingDetailFact}><Ionicons name="home-outline" size={18} color="#F28A18" /><View><Text style={styles.detailLabel}>{tr(language, "Property", "房屋", "房屋")}</Text><Text style={styles.detailValue}>{tr(language, "1-bedroom student flat · End-of-tenancy clean", "一居室学生公寓 · 退租清洁", "一房學生公寓 · 退租清潔")}</Text></View></View><View style={styles.bookingDetailFact}><Ionicons name="person-circle-outline" size={18} color={palette.green} /><View><Text style={styles.detailLabel}>{tr(language, "Assigned professional", "已安排人员", "已安排人員")}</Text><Text style={styles.detailValue}>Maya Patel · UNIMATE approved</Text></View></View></>}{detailBooking.id === "move" && <><View style={styles.bookingDetailFact}><Ionicons name="navigate-outline" size={18} color="#00A1A7" /><View><Text style={styles.detailLabel}>{tr(language, "Route", "搬运路线", "搬運路線")}</Text><Text style={styles.detailValue}>Bloomsbury → Canary Wharf</Text></View></View><View style={styles.bookingDetailFact}><Ionicons name="cube-outline" size={18} color={palette.blue} /><View><Text style={styles.detailLabel}>{tr(language, "Inventory", "物品清单", "物品清單")}</Text><Text style={styles.detailValue}>{tr(language, "4 boxes · 1 suitcase · 1 mover", "4个箱子 · 1个行李箱 · 1名搬运人员", "4個箱 · 1個行李箱 · 1名搬運人員")}</Text></View></View></>}{detailBooking.id === "market" && <><View style={styles.bookingDetailFact}><Ionicons name="receipt-outline" size={18} color="#713CE0" /><View><Text style={styles.detailLabel}>{tr(language, "Order reference", "订单编号", "訂單編號")}</Text><Text style={styles.detailValue}>UM-1048</Text></View></View><View style={styles.bookingDetailFact}><Ionicons name="checkmark-circle-outline" size={18} color={palette.green} /><View><Text style={styles.detailLabel}>{tr(language, "Handover", "交付", "交收")}</Text><Text style={styles.detailValue}>{tr(language, "Collected from the seller", "已从卖家处取货", "已從賣家處取貨")}</Text></View></View></>}</View><View style={styles.bookingReferenceCard}><Ionicons name="shield-checkmark" size={20} color={palette.green} /><Text style={styles.bookingReferenceText}>{tr(language, "This booking is protected by UNIMATE support. Your reference is included automatically if you need help.", "此预订受UNIMATE客服保障。如需帮助，系统会自动附上预订编号。", "此預訂受UNIMATE客服保障。如需協助，系統會自動附上預訂編號。")}</Text></View><Pressable style={styles.primaryButton} onPress={() => { const selected = detailBooking; setDetailBooking(null); setSupportBooking(selected); }}><Text style={styles.primaryButtonText}>{tr(language, "Get help with this booking", "获取此预订的帮助", "取得此預訂的協助")}</Text></Pressable></ScrollView>}</Sheet>
      <Sheet
        visible={supportBooking !== null}
        title={
          supportFlow
            ? supportFlow === "change"
              ? tr(language, "Change booking", "更改预订", "更改預訂")
              : supportFlow === "complaint"
                ? tr(language, "Make a complaint", "提交投诉", "提交投訴")
                : tr(language, "Request a refund", "申请退款", "申請退款")
            : tr(language, "Booking support", "预订支持", "預訂支援")
        }
        onClose={() =>
          supportFlow ? setSupportFlow(null) : setSupportBooking(null)
        }
      >
        {supportBooking &&
          (supportFlow ? (
            <ScrollView
              contentContainerStyle={styles.supportBody}
              showsVerticalScrollIndicator={false}
            >
              <SupportRequestFlow
                kind={supportFlow}
                booking={supportBooking}
                language={language}
                onBack={() => setSupportFlow(null)}
                onComplete={() => {
                  setSupportFlow(null);
                  setSupportBooking(null);
                }}
              />
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={styles.supportBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.supportBookingCard}>
                <View
                  style={[
                    styles.bookingIcon,
                    { backgroundColor: supportBooking.color + "16" },
                  ]}
                >
                  <Ionicons
                    name={supportBooking.icon as any}
                    size={21}
                    color={supportBooking.color}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bookingType}>{supportBooking.type}</Text>
                  <Text style={styles.supportBookingTitle}>
                    {supportBooking.title}
                  </Text>
                  <Text style={styles.bookingDetail}>
                    {supportBooking.detail}
                  </Text>
                </View>
              </View>
              <View style={styles.supportPromise}>
                <Ionicons
                  name="shield-checkmark"
                  size={21}
                  color={palette.green}
                />
                <Text style={styles.supportPromiseText}>
                  {tr(
                    language,
                    "Your booking reference is attached automatically. Support conversations are private and reviewed by authorised team members only.",
                    "系统会自动附上预订编号。客服对话为私人对话，仅由获授权的团队成员处理。",
                    "系統會自動附上預訂編號。客服對話為私人對話，僅由獲授權的團隊成員處理。",
                  )}
                </Text>
              </View>
              <Text style={styles.formSectionTitle}>
                {tr(
                  language,
                  "How can we help?",
                  "需要什么帮助？",
                  "需要甚麼協助？",
                )}
              </Text>
              {supportOptions.map((option) => (
                <Pressable
                  key={option.action}
                  style={styles.supportOption}
                  onPress={() => runSupportAction(option.action)}
                >
                  <View style={styles.supportOptionIcon}>
                    <Ionicons
                      name={option.icon as any}
                      size={21}
                      color={palette.blue}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.supportOptionTitle}>
                      {option.title}
                    </Text>
                    <Text style={styles.supportOptionText}>{option.text}</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={palette.muted}
                  />
                </Pressable>
              ))}
              <View style={styles.ratingCard}>
                <Text style={styles.supportOptionTitle}>
                  {supportBooking.id === "airport"
                    ? tr(
                        language,
                        "Rate your driver",
                        "为司机评分",
                        "為司機評分",
                      )
                    : supportBooking.id === "clean"
                      ? tr(
                          language,
                          "Rate your cleaner",
                          "为清洁人员评分",
                          "為清潔人員評分",
                        )
                      : tr(
                          language,
                          "Rate your experience",
                          "为服务体验评分",
                          "為服務體驗評分",
                        )}
                </Text>
                <Text style={styles.supportOptionText}>
                  {tr(
                    language,
                    "Verified reviews contribute to the provider or event host profile and help us monitor service quality.",
                    "已验证评价会计入服务人员或活动主办方资料，并帮助我们监督服务质量。",
                    "已驗證評價會計入服務人員或活動主辦方資料，並協助我們監察服務質素。",
                  )}
                </Text>
                <View style={styles.ratingStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Pressable
                      key={star}
                      accessibilityLabel={`${star} ${tr(language, "stars", "星", "星")}`}
                      onPress={() => setRating(star)}
                    >
                      <Ionicons
                        name={star <= rating ? "star" : "star-outline"}
                        size={31}
                        color="#F2A91B"
                      />
                    </Pressable>
                  ))}
                </View>
                <View style={styles.satisfactionRow}>
                  {[
                    tr(language, "Excellent", "非常满意", "非常滿意"),
                    tr(language, "Okay", "一般", "一般"),
                    tr(language, "Poor", "不满意", "不滿意"),
                  ].map((item) => (
                    <Pressable
                      key={item}
                      style={[
                        styles.satisfactionChip,
                        satisfaction === item && styles.satisfactionChipActive,
                      ]}
                      onPress={() => setSatisfaction(item)}
                    >
                      <Text
                        style={[
                          styles.satisfactionText,
                          satisfaction === item &&
                            styles.satisfactionTextActive,
                        ]}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  disabled={!rating}
                  style={[styles.primaryButton, !rating && { opacity: 0.45 }]}
                  onPress={() =>
                    Alert.alert(
                      tr(language, "Thank you", "谢谢反馈", "多謝你的意見"),
                      tr(
                        language,
                        "Your verified rating has been submitted and will contribute to the provider or event host profile.",
                        "你的已验证评分已提交，并将计入服务人员或活动主办方资料。",
                        "你的已驗證評分已提交，並將計入服務人員或活動主辦方資料。",
                      ),
                    )
                  }
                >
                  <Text style={styles.primaryButtonText}>
                    {tr(language, "Submit feedback", "提交反馈", "提交意見")}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          ))}
      </Sheet>
    </>
  );
}

function MessagesPage({
  language,
  initialThread,
  onClearInitialThread,
  eventAnnouncements,
}: {
  language: Language;
  initialThread?: "support" | "lost" | "group" | null;
  onClearInitialThread?: () => void;
  eventAnnouncements: string[];
}) {
  const [selected, setSelected] = useState<string | null>(
    initialThread || null,
  );
  const [profileStaff, setProfileStaff] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberRequests, setMemberRequests] = useState<string[]>([]);
  const [technicianRequested, setTechnicianRequested] = useState(false);
  const [supportSessionEnded, setSupportSessionEnded] = useState(false);
  const [technicianRating, setTechnicianRating] = useState(0);
  const [technicianRatingSubmitted, setTechnicianRatingSubmitted] =
    useState(false);
  const [lostMode, setLostMode] = useState<"lost" | "found">("lost");
  const [lostDescription, setLostDescription] = useState("");
  const [lostReference, setLostReference] = useState("");
  const [lostPhotos, setLostPhotos] = useState<string[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [messageAttachments, setMessageAttachments] = useState<
    { name: string; uri: string; type: "image" | "file" }[]
  >([]);
  const [sentMessages, setSentMessages] = useState<
    {
      text: string;
      attachments: { name: string; uri: string; type: "image" | "file" }[];
    }[]
  >([]);
  const addLostPhotos = async (source: PhotoSource) => { const uris = await selectPhotoUris(language, source, { multiple: source === "library", limit: Math.max(1, 6 - lostPhotos.length), quality: .8 }); if (uris.length) setLostPhotos([...lostPhotos, ...uris].slice(0, 6)); };
  const staffProfiles: Record<
    string,
    {
      name: string;
      role: string;
      image: string;
      rating: string;
      reviews?: number;
      ratings?: number;
      jobs: number;
      review?: string;
    }
  > = {
    driver: {
      name: "Alex Morgan",
      role: tr(
        language,
        "Airport transfer driver",
        "机场接送司机",
        "機場接送司機",
      ),
      image:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400",
      rating: "4.9",
      reviews: 186,
      jobs: 742,
      review: tr(
        language,
        "Clear meeting instructions and a very smooth journey.",
        "见面说明清楚，行程非常顺利。",
        "見面說明清楚，行程非常順利。",
      ),
    },
    cleaner: {
      name: "Maya Patel",
      role: tr(
        language,
        "Cleaning professional",
        "专业保洁人员",
        "專業清潔人員",
      ),
      image:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
      rating: "4.8",
      reviews: 129,
      jobs: 518,
      review: tr(
        language,
        "Careful, punctual and very thorough.",
        "细心、准时，清洁非常彻底。",
        "細心、準時，清潔非常徹底。",
      ),
    },
    mover: {
      name: "Jordan Lee",
      role: tr(
        language,
        "Moving team lead",
        "搬家团队负责人",
        "搬屋團隊負責人",
      ),
      image:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
      rating: "4.9",
      reviews: 94,
      jobs: 361,
      review: tr(
        language,
        "Handled everything carefully and kept us updated.",
        "搬运细心，并全程及时沟通。",
        "搬運細心，並全程及時溝通。",
      ),
    },
    technician: {
      name: "Jenna Williams",
      role: tr(
        language,
        "UNIMATE support technician",
        "UNIMATE 客服专员",
        "UNIMATE 客服專員",
      ),
      image:
        "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=400",
      rating: "4.9",
      ratings: 214,
      jobs: 986,
    },
  };
  const chats = [
    {
      id: "driver",
      title: staffProfiles.driver.name,
      preview: tr(
        language,
        "I will send the meeting point when your flight lands.",
        "航班落地后，我会发送见面地点。",
        "航班落地後，我會發送見面地點。",
      ),
      time: "10:24",
      icon: "car-sport",
      color: "#17A957",
      badge: 1,
      type: `${tr(language, "Approved staff", "已认证员工", "已認證員工")} · ${staffProfiles.driver.role}`,
    },
    {
      id: "cleaner",
      title: staffProfiles.cleaner.name,
      preview: tr(
        language,
        "Thanks—the room photos have been received.",
        "谢谢，我们已收到房间照片。",
        "謝謝，我們已收到房間相片。",
      ),
      time: tr(language, "Yesterday", "昨天", "昨天"),
      icon: "sparkles",
      color: "#F28A18",
      badge: 0,
      type: `${tr(language, "Approved staff", "已认证员工", "已認證員工")} · ${staffProfiles.cleaner.role}`,
    },
    {
      id: "mover",
      title: staffProfiles.mover.name,
      preview: tr(
        language,
        "Your item list has been checked for the van size.",
        "已根据物品清单确认所需车型。",
        "已根據物品清單確認所需車型。",
      ),
      time: tr(language, "Yesterday", "昨天", "昨天"),
      icon: "cube",
      color: "#00A1A7",
      badge: 0,
      type: `${tr(language, "Approved staff", "已认证员工", "已認證員工")} · ${staffProfiles.mover.role}`,
    },
    {
      id: "friend",
      title: "@londonlatte",
      preview: tr(
        language,
        "Shall we meet before the event?",
        "我们要不要在活动前见面？",
        "我們要不要在活動前見面？",
      ),
      time: tr(language, "Yesterday", "昨天", "昨天"),
      icon: "person",
      color: "#0878E6",
      badge: 2,
      type: tr(language, "Friend chat", "好友对话", "好友對話"),
    },
    {
      id: "group",
      title: tr(
        language,
        "Thames Cruise group",
        "泰晤士河游船群聊",
        "泰晤士河遊船群聊",
      ),
      preview: tr(
        language,
        "Organiser: Entry instructions have been posted.",
        "主办方：入场说明已发布。",
        "主辦方：入場說明已發佈。",
      ),
      time: tr(language, "Monday", "周一", "週一"),
      icon: "people",
      color: "#7542C8",
      badge: 0,
      type: tr(
        language,
        "Event group chat · 68 members",
        "活动群聊 · 68名成员",
        "活動群聊 · 68名成員",
      ),
    },
    {
      id: "support",
      title: tr(language, "UNIMATE Support", "UNIMATE 客服", "UNIMATE 客服"),
      preview: tr(
        language,
        "UniBot can answer FAQs or connect you to a real technician.",
        "UniBot 可回答常见问题或为你联系真人技术人员。",
        "UniBot 可回答常見問題或為你聯絡真人技術人員。",
      ),
      time: tr(language, "Online", "在线", "在線"),
      icon: "chatbubbles",
      color: "#0878E6",
      badge: 0,
      type: tr(
        language,
        "UniBot · Human support available",
        "UniBot · 可联系人工客服",
        "UniBot · 可聯絡人工客服",
      ),
    },
    {
      id: "lost",
      title: tr(
        language,
        "Lost & found support",
        "失物招领客服",
        "失物認領客服",
      ),
      preview: tr(
        language,
        "Report an item lost or found during a service.",
        "报告服务期间遗失或拾获的物品。",
        "報告服務期間遺失或拾獲的物品。",
      ),
      time: tr(language, "Support", "客服", "客服"),
      icon: "briefcase",
      color: "#B67A16",
      badge: 0,
      type: tr(language, "UNIMATE support", "UNIMATE客服", "UNIMATE客服"),
    },
  ];
  const groupMembers = [friends[0], friends[1], friends[2], friends[3]];
  const active = chats.find((chat) => chat.id === selected);
  const shownStaff = profileStaff ? staffProfiles[profileStaff] : null;
  const addChatPhotos = async (source: PhotoSource) => {
    const uris = await selectPhotoUris(language, source, {
      multiple: source === "library",
      quality: 0.8,
      limit: Math.max(1, 6 - messageAttachments.length),
    });
    if (uris.length)
      setMessageAttachments(
        [
          ...messageAttachments,
          ...uris.map((uri, index) => ({
            name: `Photo ${index + 1}`,
            uri,
            type: "image" as const,
          })),
        ].slice(0, 6),
      );
  };
  const addChatFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!result.canceled)
      setMessageAttachments(
        [
          ...messageAttachments,
          ...result.assets.map((asset) => ({
            name: asset.name,
            uri: asset.uri,
            type: "file" as const,
          })),
        ].slice(0, 6),
      );
  };
  const openAttachmentMenu = () =>
    Alert.alert(
      tr(language, "Attach to message", "添加附件", "加入附件"),
      tr(
        language,
        "Take a photo, choose from your library, or attach a file. You can send up to 6 items.",
        "可拍摄照片、从照片库选择或添加文件，最多6个附件。",
        "可拍攝相片、從相片庫選擇或加入文件，最多6個附件。",
      ),
      [
        {
          text: tr(language, "Open camera", "打开相机", "開啟相機"),
          onPress: () => addChatPhotos("camera"),
        },
        {
          text: tr(language, "Photo library", "照片库", "相片庫"),
          onPress: () => addChatPhotos("library"),
        },
        {
          text: tr(language, "File or document", "文件", "文件"),
          onPress: addChatFiles,
        },
        { text: tr(language, "Cancel", "取消", "取消"), style: "cancel" },
      ],
    );
  const sendChatMessage = () => {
    if (!messageDraft.trim() && !messageAttachments.length) return;
    setSentMessages([
      ...sentMessages,
      { text: messageDraft.trim(), attachments: messageAttachments },
    ]);
    setMessageDraft("");
    setMessageAttachments([]);
    setEmojiOpen(false);
  };
  const chatEmojis = [
    "😊",
    "😂",
    "❤️",
    "👍",
    "🙏",
    "🎉",
    "😢",
    "😮",
    "✅",
    "📍",
    "📎",
    "✨",
  ];
  const staffSheet = (
    <Sheet
      visible={shownStaff !== null}
      title={tr(
        language,
        "Approved staff profile",
        "认证员工资料",
        "認證員工資料",
      )}
      onClose={() => setProfileStaff(null)}
    >
      {shownStaff && (
        <ScrollView contentContainerStyle={styles.staffProfileBody}>
          <Image
            source={{ uri: shownStaff.image }}
            style={styles.staffProfilePhoto}
          />
          <View style={styles.approvedPill}>
            <Ionicons name="shield-checkmark" size={17} color="white" />
            <Text style={styles.approvedPillText}>
              {tr(language, "UNIMATE APPROVED", "UNIMATE认证", "UNIMATE認證")}
            </Text>
          </View>
          <Text style={styles.staffProfileName}>{shownStaff.name}</Text>
          <Text style={styles.staffProfileRole}>{shownStaff.role}</Text>
          <View style={styles.staffStats}>
            <View style={styles.staffStat}>
              <Text style={styles.staffStatValue}>★ {shownStaff.rating}</Text>
              <Text style={styles.staffStatLabel}>
                {profileStaff === "technician"
                  ? `${shownStaff.ratings || 0} ${tr(language, "ratings", "个评分", "個評分")}`
                  : `${shownStaff.reviews || 0} ${tr(language, "reviews", "条评价", "則評價")}`}
              </Text>
            </View>
            <View style={styles.staffStat}>
              <Text style={styles.staffStatValue}>{shownStaff.jobs}</Text>
              <Text style={styles.staffStatLabel}>
                {tr(language, "completed jobs", "次已完成服务", "次已完成服務")}
              </Text>
            </View>
          </View>
          <Text style={styles.formSectionTitle}>
            {tr(language, "Approval checks", "认证审核", "認證審核")}
          </Text>
          <View style={styles.staffChecks}>
            {[
              tr(language, "Identity checked", "身份已核验", "身份已核實"),
              tr(language, "Background checked", "背景已审核", "背景已審核"),
              tr(language, "Interview passed", "已通过面试", "已通過面試"),
              tr(
                language,
                "UNIMATE training completed",
                "已完成UNIMATE培训",
                "已完成UNIMATE培訓",
              ),
            ].map((item) => (
              <View key={item} style={styles.staffCheck}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={palette.green}
                />
                <Text style={styles.staffCheckText}>{item}</Text>
              </View>
            ))}
          </View>
          {profileStaff === "technician" ? (
            <View style={styles.technicianFeedbackPolicy}>
              <Ionicons name="star-outline" size={21} color={palette.blue} />
              <View style={{ flex: 1 }}>
                <Text style={styles.technicianFeedbackPolicyTitle}>
                  {tr(language, "Star ratings only", "仅星级评分", "僅星級評分")}
                </Text>
                <Text style={styles.technicianFeedbackPolicyText}>
                  {tr(
                    language,
                    "Support technicians do not receive public written reviews. Customers can leave a private star rating after a completed session.",
                    "客服专员不接收公开文字评价。客户可在服务完成后提交私密星级评分。",
                    "客服專員不接收公開文字評價。客戶可在服務完成後提交私密星級評分。",
                  )}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.formSectionTitle}>
                {tr(
                  language,
                  "Recent verified review",
                  "近期已验证评价",
                  "近期已驗證評價",
                )}
              </Text>
              <View style={styles.staffReview}>
                <Text style={styles.staffReviewStars}>★★★★★</Text>
                <Text style={styles.staffReviewText}>“{shownStaff.review}”</Text>
                <Text style={styles.staffReviewMeta}>
                  {tr(
                    language,
                    "Verified service customer",
                    "已验证服务客户",
                    "已驗證服務客戶",
                  )}
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </Sheet>
  );
  const membersSheet = (
    <Sheet
      visible={membersOpen}
      title={tr(language, "Group members", "群聊成员", "群組成員")}
      onClose={() => setMembersOpen(false)}
    >
      <ScrollView contentContainerStyle={styles.groupMembersBody}>
        <View style={styles.groupPrivacy}>
          <Ionicons name="lock-closed" size={20} color={palette.blue} />
          <Text style={styles.groupPrivacyText}>
            {tr(
              language,
              "Group members see limited student profiles only. Full names, contact details and social accounts stay private unless a friend request is accepted.",
              "群成员只能查看有限学生资料。真实姓名、联系方式和社交账号会保持隐藏，除非好友请求获接受。",
              "群組成員只能查看有限學生資料。真實姓名、聯絡方式及社交帳號會保持隱藏，除非好友請求獲接受。",
            )}
          </Text>
        </View>
        {groupMembers.map((member) => (
          <View key={member.username} style={styles.groupMemberRow}>
            <View
              style={[
                styles.avatar,
                styles.groupMemberAvatar,
                { backgroundColor: member.color },
              ]}
            >
              <Text style={styles.avatarText}>{member.initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>{member.username}</Text>
              <Text style={styles.friendUni}>{member.uni}</Text>
              <Text style={styles.friendInterests}>
                {member.interests.slice(0, 2).join(" · ")}
              </Text>
            </View>
            <Pressable
              style={[
                styles.follow,
                memberRequests.includes(member.username) && styles.followSent,
              ]}
              onPress={() =>
                setMemberRequests([...memberRequests, member.username])
              }
            >
              <Text
                style={[
                  styles.followText,
                  memberRequests.includes(member.username) && {
                    color: palette.blue,
                  },
                ]}
              >
                {memberRequests.includes(member.username) ? "✓" : "+"}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
  if (active)
    return (
      <>
        <View style={styles.chatScreen}>
          <View style={styles.chatHead}>
            <Pressable
              onPress={() => {
                setSelected(null);
                onClearInitialThread?.();
              }}
            >
              <Ionicons name="arrow-back" size={23} color={palette.blue} />
            </Pressable>
            <Pressable
              disabled={!staffProfiles[active.id]}
              onPress={() => setProfileStaff(active.id)}
            >
              {staffProfiles[active.id] ? (
                <Image
                  source={{ uri: staffProfiles[active.id].image }}
                  style={styles.chatStaffPhoto}
                />
              ) : (
                <View
                  style={[
                    styles.chatAvatar,
                    { backgroundColor: active.color + "16" },
                  ]}
                >
                  <Ionicons
                    name={active.icon as any}
                    size={19}
                    color={active.color}
                  />
                </View>
              )}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.chatTitle}>{active.title}</Text>
              <Text style={styles.chatType}>{active.type}</Text>
            </View>
            {staffProfiles[active.id] && (
              <Pressable
                style={styles.chatHeadAction}
                onPress={() => setProfileStaff(active.id)}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={20}
                  color={palette.green}
                />
              </Pressable>
            )}
            {active.id === "group" && (
              <Pressable
                style={styles.chatHeadAction}
                onPress={() => setMembersOpen(true)}
              >
                <Ionicons name="people" size={20} color={palette.blue} />
              </Pressable>
            )}
          </View>
          <View style={styles.chatSafety}>
            <Ionicons name="shield-checkmark" size={18} color={palette.green} />
            <Text style={styles.chatSafetyText}>
              {tr(
                language,
                "Chats are monitored by UNIMATE admins for safety. Report anything that makes you uncomfortable.",
                "为保障安全，UNIMATE 管理员会监督对话。如遇不适内容，请立即举报。",
                "為保障安全，UNIMATE 管理員會監察對話。如遇不適內容，請立即舉報。",
              )}
            </Text>
          </View>
          {active.id === "group" && (
            <Pressable
              style={styles.groupChatBanner}
              onPress={() => setMembersOpen(true)}
            >
              <Ionicons name="people-outline" size={20} color={palette.blue} />
              <View style={{ flex: 1 }}>
                <Text style={styles.supportOptionTitle}>
                  {tr(
                    language,
                    "68 ticket holders in this group",
                    "群聊内有68名持票参加者",
                    "群組內有68名持票參加者",
                  )}
                </Text>
                <Text style={styles.supportOptionText}>
                  {tr(
                    language,
                    "View limited member profiles and send friend requests.",
                    "查看有限成员资料并发送好友请求。",
                    "查看有限成員資料並發送好友請求。",
                  )}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={17}
                color={palette.muted}
              />
            </Pressable>
          )}
          <ScrollView contentContainerStyle={styles.chatMessages}>
            {active.id === "group" && eventAnnouncements.length > 0 && (
              <>
                {eventAnnouncements.map((announcement, index) => (
                  <View key={`${announcement}-${index}`} style={styles.organiserAnnouncement}>
                    <View style={styles.organiserAnnouncementHead}>
                      <View style={styles.organiserAnnouncementIcon}>
                        <Ionicons name="megaphone" size={17} color="white" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.organiserAnnouncementTitle}>
                          {tr(language, "Organiser announcement", "主办方公告", "主辦方公告")}
                        </Text>
                        <Text style={styles.organiserAnnouncementTime}>
                          {tr(language, "Just now", "刚刚", "剛剛")}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.organiserAnnouncementText}>{announcement}</Text>
                    <View style={styles.organiserAnnouncementDelivery}>
                      <Ionicons name="notifications-outline" size={14} color={palette.green} />
                      <Text style={styles.organiserAnnouncementDeliveryText}>
                        {tr(language, "All paid attendees notified", "所有已付款参加者已收到通知", "所有已付款參加者已收到通知")}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
            {active.id === "support" ? (
              <>
                <View style={styles.botIdentity}>
                  <View style={styles.botIcon}>
                    <Ionicons name="sparkles" size={18} color="white" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.botName}>UniBot</Text>
                    <Text style={styles.botMeta}>
                      {tr(
                        language,
                        "Automated help · Human support available",
                        "自动客服 · 可联系人工客服",
                        "自動客服 · 可聯絡人工客服",
                      )}
                    </Text>
                  </View>
                </View>
                <View style={styles.incomingBubble}>
                  <Text style={styles.incomingText}>
                    {tr(
                      language,
                      "Hi! I can answer common questions about bookings, payments and services. Choose a topic or ask to speak with a real technician.",
                      "你好！我可以回答有关预订、付款和服务的常见问题。请选择主题，或要求联系真人技术人员。",
                      "你好！我可以回答有關預訂、付款及服務的常見問題。請選擇主題，或要求聯絡真人技術人員。",
                    )}
                  </Text>
                </View>
                <View style={styles.faqGrid}>
                  {[
                    tr(language, "Change a booking", "更改预订", "更改預訂"),
                    tr(language, "Refund timing", "退款时间", "退款時間"),
                    tr(language, "Lost property", "失物招领", "失物認領"),
                  ].map((item) => (
                    <Pressable
                      key={item}
                      style={styles.faqButton}
                      onPress={() =>
                        Alert.alert(
                          item,
                          item.includes("Refund") || item.includes("退款")
                            ? tr(
                                language,
                                "Most approved refunds return to the original payment method within 5–10 working days.",
                                "大多数获批退款会在5至10个工作日内退回原付款方式。",
                                "大多數獲批退款會在5至10個工作日內退回原付款方式。",
                              )
                            : item.includes("Lost") || item.includes("失物")
                              ? tr(
                                  language,
                                  "Open Lost & found support to create a claim and receive a tracking reference.",
                                  "请打开失物招领客服创建申报并获取追踪编号。",
                                  "請開啟失物認領客服建立申報並取得追蹤編號。",
                                )
                              : tr(
                                  language,
                                  "Dates and times close 48 hours before; service details close 24 hours before.",
                                  "日期和时间需提前48小时更改，服务详情需提前24小时更改。",
                                  "日期及時間需提前48小時更改，服務詳情需提前24小時更改。",
                                ),
                        )
                      }
                    >
                      <Text style={styles.faqButtonText}>{item}</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color={palette.blue}
                      />
                    </Pressable>
                  ))}
                </View>
                {technicianRequested ? (
                  <>
                    <View style={styles.technicianJoinedNotice}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={palette.green}
                      />
                      <Text style={styles.technicianJoinedNoticeText}>
                        {tr(
                          language,
                          "Jenna (technician) has joined the chat",
                          "Jenna（客服专员）已加入对话",
                          "Jenna（客服專員）已加入對話",
                        )}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.technicianIdentity}
                      onPress={() => setProfileStaff("technician")}
                    >
                      <Image
                        source={{ uri: staffProfiles.technician.image }}
                        style={styles.technicianPhoto}
                      />
                      <View style={{ flex: 1 }}>
                        <View style={styles.technicianNameRow}>
                          <Text style={styles.technicianName}>Jenna Williams</Text>
                          <View style={styles.technicianVerifiedPill}>
                            <Ionicons
                              name="shield-checkmark"
                              size={12}
                              color={palette.green}
                            />
                            <Text style={styles.technicianVerifiedText}>
                              {tr(language, "Verified", "已认证", "已認證")}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.technicianRole}>
                          {staffProfiles.technician.role}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={palette.muted}
                      />
                    </Pressable>
                    <View style={styles.technicianMessageRow}>
                      <Image
                        source={{ uri: staffProfiles.technician.image }}
                        style={styles.technicianMessagePhoto}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.technicianMessageAuthor}>
                          Jenna · {tr(language, "Technician", "客服专员", "客服專員")}
                        </Text>
                        <View style={styles.technicianMessageBubble}>
                          <Text style={styles.incomingText}>
                            {tr(
                              language,
                              "Hi Sophie, I’m Jenna from the UNIMATE support team. I’ve reviewed reference SUP-260922 and I’m here to help. Could you tell me a little more about what you need?",
                              "你好Sophie，我是UNIMATE客服团队的Jenna。我已查看参考编号SUP-260922，现在由我协助你。请告诉我更多详情好吗？",
                              "你好Sophie，我是UNIMATE客服團隊的Jenna。我已查看參考編號SUP-260922，現在由我協助你。請告訴我更多詳情好嗎？",
                            )}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {!supportSessionEnded ? (
                      <Pressable
                        style={styles.endSupportSessionButton}
                        onPress={() => setSupportSessionEnded(true)}
                      >
                        <Ionicons name="checkmark-done-outline" size={19} color={palette.blue} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.endSupportSessionTitle}>
                            {tr(language, "End support session", "结束客服会话", "結束客服會話")}
                          </Text>
                          <Text style={styles.endSupportSessionText}>
                            {tr(language, "Choose this once Jenna has resolved your issue.", "Jenna解决问题后可选择此项。", "Jenna解決問題後可選擇此項。")}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={palette.muted} />
                      </Pressable>
                    ) : technicianRatingSubmitted ? (
                      <View style={styles.technicianRatingThanks}>
                        <View style={styles.technicianRatingThanksIcon}><Ionicons name="checkmark" size={19} color="white" /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.technicianRatingThanksTitle}>{tr(language, "Rating submitted", "评分已提交", "評分已提交")}</Text>
                          <Text style={styles.technicianRatingThanksText}>{tr(language, `You gave Jenna ${technicianRating} out of 5 stars. This private rating helps UNIMATE monitor support quality.`, `你给Jenna评了${technicianRating}星（满5星）。该私密评分将帮助UNIMATE监控客服质量。`, `你給Jenna評了${technicianRating}星（滿5星）。該私密評分將幫助UNIMATE監控客服質量。`)}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.technicianRatingCard}>
                        <View style={styles.technicianRatingHead}>
                          <View style={styles.technicianRatingIcon}><Ionicons name="star" size={21} color="#F2B94B" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.technicianRatingTitle}>{tr(language, "Rate your session with Jenna", "为与Jenna的客服会话评分", "為與Jenna的客服會話評分")}</Text>
                            <Text style={styles.technicianRatingSubtitle}>{tr(language, "How helpful was the support you received?", "这次客服对你有多大帮助？", "這次客服對你有多大幫助？")}</Text>
                          </View>
                        </View>
                        <View style={styles.technicianStars}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Pressable
                              key={star}
                              accessibilityLabel={`${star} ${tr(language, "stars", "星", "星")}`}
                              style={[styles.technicianStarButton, technicianRating >= star && styles.technicianStarButtonActive]}
                              onPress={() => setTechnicianRating(star)}
                            >
                              <Ionicons name={technicianRating >= star ? "star" : "star-outline"} size={27} color={technicianRating >= star ? "#E8A900" : palette.muted} />
                            </Pressable>
                          ))}
                        </View>
                        <View style={styles.technicianNoReviewNote}>
                          <Ionicons name="lock-closed-outline" size={15} color={palette.blue} />
                          <Text style={styles.technicianNoReviewText}>{tr(language, "Star rating only · No public written review will be created.", "仅星级评分 · 不会生成公开文字评价。", "僅星級評分 · 不會產生公開文字評價。")}</Text>
                        </View>
                        <Pressable
                          disabled={!technicianRating}
                          style={[styles.submitTechnicianRating, !technicianRating && { opacity: 0.45 }]}
                          onPress={() => setTechnicianRatingSubmitted(true)}
                        >
                          <Text style={styles.submitTechnicianRatingText}>{tr(language, "Submit rating", "提交评分", "提交評分")}</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                ) : (
                  <Pressable
                    style={styles.technicianButton}
                    onPress={() => setTechnicianRequested(true)}
                  >
                    <Ionicons name="headset-outline" size={20} color="white" />
                    <Text style={styles.technicianButtonText}>
                      {tr(
                        language,
                        "Connect me to a real technician",
                        "联系真人技术人员",
                        "聯絡真人技術人員",
                      )}
                    </Text>
                  </Pressable>
                )}
              </>
            ) : active.id === "lost" ? (
              <>
                <View style={styles.incomingBubble}>
                  <Text style={styles.incomingText}>
                    {tr(
                      language,
                      "Tell us whether an item was lost or found, then describe it clearly. We will create a claim and send updates here.",
                      "请选择物品是遗失还是拾获，并清楚描述。我们会创建申报并在此发送进度。",
                      "請選擇物品是遺失還是拾獲，並清楚描述。我們會建立申報並在此傳送進度。",
                    )}
                  </Text>
                </View>
                <View style={styles.lostModeRow}>
                  {(["lost", "found"] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      style={[
                        styles.lostModeButton,
                        lostMode === mode && styles.lostModeButtonActive,
                      ]}
                      onPress={() => setLostMode(mode)}
                    >
                      <Ionicons
                        name={
                          mode === "lost"
                            ? "search-outline"
                            : "hand-left-outline"
                        }
                        size={18}
                        color={lostMode === mode ? "white" : palette.blue}
                      />
                      <Text
                        style={[
                          styles.lostModeText,
                          lostMode === mode && styles.lostModeTextActive,
                        ]}
                      >
                        {mode === "lost"
                          ? tr(
                              language,
                              "I lost an item",
                              "我遗失了物品",
                              "我遺失了物品",
                            )
                          : tr(
                              language,
                              "I found an item",
                              "我拾获了物品",
                              "我拾獲了物品",
                            )}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {lostReference ? (
                  <View style={styles.lostClaimCard}>
                    <Ionicons
                      name="checkmark-circle"
                      size={27}
                      color={palette.green}
                    />
                    <Text style={styles.lostClaimTitle}>
                      {tr(
                        language,
                        "Claim created",
                        "申报已创建",
                        "申報已建立",
                      )}
                    </Text>
                    <Text style={styles.lostClaimReference}>
                      {lostReference}
                    </Text>
                    <Text style={styles.lostClaimText}>
                      {tr(
                        language,
                        "Updates and ownership checks will appear in this conversation.",
                        "进度和物主核验信息将显示在此对话中。",
                        "進度及物主核實資料將顯示在此對話中。",
                      )}
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={[styles.field, styles.textAreaField]}>
                      <Text style={styles.fieldLabel}>
                        {tr(
                          language,
                          "Describe the item",
                          "描述物品",
                          "描述物品",
                        )}
                      </Text>
                      <TextInput
                        multiline
                        value={lostDescription}
                        onChangeText={setLostDescription}
                        style={styles.textAreaInput}
                        placeholder={tr(
                          language,
                          "Colour, brand, identifying marks, where and when…",
                          "颜色、品牌、识别特征、地点和时间…",
                          "顏色、品牌、識別特徵、地點及時間…",
                        )}
                        placeholderTextColor="#A1ADBE"
                      />
                    </View>
                    <View style={styles.lostPhotoCard}><View style={styles.lostPhotoHead}><View style={styles.lostPhotoIcon}><Ionicons name="camera-outline" size={20} color={palette.blue} /></View><View style={{ flex: 1 }}><Text style={styles.supportOptionTitle}>{tr(language, "Add photos of the item", "添加物品照片", "加入物品相片")}</Text><Text style={styles.supportOptionText}>{tr(language, "Optional, but clear photos help us identify and return items faster.", "选填。清晰照片能帮助我们更快识别并归还物品。", "選填。清晰相片能幫助我們更快識別並歸還物品。")}</Text></View><Text style={styles.lostPhotoCount}>{lostPhotos.length}/6</Text></View><PhotoSourceActions language={language} onCamera={() => addLostPhotos("camera")} onLibrary={() => addLostPhotos("library")} />{lostPhotos.length > 0 && <View style={styles.cleanPhotoGrid}>{lostPhotos.map((uri, index) => <Pressable key={`${uri}-${index}`} style={styles.cleanPhotoWrap} onPress={() => setLostPhotos(lostPhotos.filter((_, photoIndex) => photoIndex !== index))}><Image source={{ uri }} style={styles.cleanPhoto} /><View style={styles.removePhoto}><Ionicons name="close" size={13} color="white" /></View></Pressable>)}</View>}</View>
                    <Pressable
                      disabled={!lostDescription.trim()}
                      style={[
                        styles.primaryButton,
                        !lostDescription.trim() && { opacity: 0.45 },
                      ]}
                      onPress={() =>
                        setLostReference(
                          `LAF-${Math.floor(100000 + Math.random() * 900000)}`,
                        )
                      }
                    >
                      <Text style={styles.primaryButtonText}>
                        {tr(
                          language,
                          "Create lost-property claim",
                          "创建失物申报",
                          "建立失物申報",
                        )}
                      </Text>
                    </Pressable>
                  </>
                )}
              </>
            ) : (
              <>
                <View style={styles.incomingBubble}>
                  <Text style={styles.incomingText}>{active.preview}</Text>
                </View>
                <View style={styles.outgoingBubble}>
                  <Text style={styles.outgoingText}>
                    {tr(
                      language,
                      "Thank you, understood.",
                      "好的，谢谢。",
                      "好的，謝謝。",
                    )}
                  </Text>
                </View>
              </>
            )}
            {sentMessages.map((message, index) => (
              <View key={`sent-${index}`} style={styles.sentMessageGroup}>
                {message.attachments.length > 0 && (
                  <View style={styles.sentAttachmentGrid}>
                    {message.attachments.map((attachment, attachmentIndex) =>
                      attachment.type === "image" ? (
                        <Image
                          key={attachment.uri + attachmentIndex}
                          source={{ uri: attachment.uri }}
                          style={styles.sentAttachmentImage}
                        />
                      ) : (
                        <View
                          key={attachment.uri + attachmentIndex}
                          style={styles.sentFileCard}
                        >
                          <Ionicons
                            name="document-text"
                            size={20}
                            color={palette.blue}
                          />
                          <Text numberOfLines={1} style={styles.sentFileName}>
                            {attachment.name}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                )}
                {!!message.text && (
                  <View style={styles.outgoingBubble}>
                    <Text style={styles.outgoingText}>{message.text}</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
          <View style={styles.chatComposerArea}>
            {messageAttachments.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.attachmentPreviewRow}
              >
                {messageAttachments.map((attachment, index) => (
                  <View
                    key={attachment.uri + index}
                    style={styles.attachmentPreview}
                  >
                    {attachment.type === "image" ? (
                      <Image
                        source={{ uri: attachment.uri }}
                        style={styles.attachmentPreviewImage}
                      />
                    ) : (
                      <Ionicons
                        name="document-text-outline"
                        size={24}
                        color={palette.blue}
                      />
                    )}
                    <Text
                      numberOfLines={1}
                      style={styles.attachmentPreviewName}
                    >
                      {attachment.name}
                    </Text>
                    <Pressable
                      accessibilityLabel={tr(
                        language,
                        "Remove attachment",
                        "移除附件",
                        "移除附件",
                      )}
                      style={styles.attachmentRemove}
                      onPress={() =>
                        setMessageAttachments(
                          messageAttachments.filter(
                            (_, attachmentIndex) => attachmentIndex !== index,
                          ),
                        )
                      }
                    >
                      <Ionicons name="close" size={12} color="white" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
            {emojiOpen && (
              <View style={styles.emojiTray}>
                {chatEmojis.map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={styles.emojiOption}
                    onPress={() => setMessageDraft(messageDraft + emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.chatComposer}>
              <Pressable
                accessibilityLabel={tr(
                  language,
                  "Attach a file",
                  "添加附件",
                  "加入附件",
                )}
                style={styles.chatToolButton}
                onPress={openAttachmentMenu}
              >
                <Ionicons name="add" size={23} color={palette.blue} />
              </Pressable>
              <Pressable
                accessibilityLabel={tr(
                  language,
                  "Choose an emoji",
                  "选择表情",
                  "選擇表情",
                )}
                style={[
                  styles.chatToolButton,
                  emojiOpen && styles.chatToolButtonActive,
                ]}
                onPress={() => setEmojiOpen(!emojiOpen)}
              >
                <Ionicons name="happy-outline" size={21} color={palette.blue} />
              </Pressable>
              <TextInput
                style={styles.chatInput}
                value={messageDraft}
                onChangeText={setMessageDraft}
                placeholder={tr(
                  language,
                  "Write a message…",
                  "输入消息…",
                  "輸入訊息…",
                )}
                placeholderTextColor="#8B98AD"
              />
              <Pressable
                accessibilityLabel={tr(
                  language,
                  "Send message",
                  "发送消息",
                  "傳送訊息",
                )}
                disabled={!messageDraft.trim() && !messageAttachments.length}
                style={[
                  styles.chatSend,
                  !messageDraft.trim() &&
                    !messageAttachments.length &&
                    styles.chatSendDisabled,
                ]}
                onPress={sendChatMessage}
              >
                <Ionicons name="send" size={18} color="white" />
              </Pressable>
            </View>
          </View>
        </View>
        {staffSheet}
        {membersSheet}
      </>
    );
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>{words[language].messages}</Text>
        <Search
          placeholder={tr(
            language,
            "Search messages…",
            "搜索消息…",
            "搜尋訊息…",
          )}
        />
        <View style={styles.messageSafety}>
          <Ionicons name="shield-checkmark" size={21} color={palette.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.messageSafetyTitle}>
              {tr(
                language,
                "Safe, supported conversations",
                "安全、有保障的对话",
                "安全、有保障的對話",
              )}
            </Text>
            <Text style={styles.messageSafetyText}>
              {tr(
                language,
                "Private service chats, friend messages and event groups are monitored by admins to help keep students safe.",
                "司机、保洁人员、好友和活动群聊均由管理员监督，以协助保障学生安全。",
                "司機、清潔人員、好友和活動群聊均由管理員監察，以協助保障學生安全。",
              )}
            </Text>
          </View>
        </View>
        {chats.map((chat) => {
          const staff = staffProfiles[chat.id];
          return (
            <Pressable
              key={chat.id}
              style={styles.messageRow}
              onPress={() => setSelected(chat.id)}
            >
              <View style={styles.messageAvatarWrap}>
                {staff ? (
                  <Image
                    source={{ uri: staff.image }}
                    style={styles.messageAvatarPhoto}
                  />
                ) : (
                  <View
                    style={[
                      styles.messageAvatar,
                      { backgroundColor: chat.color + "16" },
                    ]}
                  >
                    <Ionicons
                      name={chat.icon as any}
                      size={22}
                      color={chat.color}
                    />
                  </View>
                )}
                {staff && (
                  <View style={styles.staffVerifiedMini}>
                    <Ionicons name="checkmark" size={9} color="white" />
                  </View>
                )}
                {chat.badge > 0 && (
                  <View style={styles.messageBadge}>
                    <Text style={styles.messageBadgeText}>{chat.badge}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.messageTitleRow}>
                  <Text style={styles.messageTitle}>{chat.title}</Text>
                  <Text style={styles.messageTime}>{chat.time}</Text>
                </View>
                <Text style={styles.messageType}>{chat.type}</Text>
                <Text style={styles.messagePreview} numberOfLines={1}>
                  {chat.preview}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {staffSheet}
      {membersSheet}
    </>
  );
}

function LocationPicker({
  visible,
  language,
  onClose,
  onSelect,
}: {
  visible: boolean;
  language: Language;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const [manual, setManual] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState("");
  const addressDirectory = [
    { address: "1 Gower Street, Bloomsbury, London", postcode: "WC1E 6BT" },
    { address: "18 Gower Street, Bloomsbury, London", postcode: "WC1E 6BT" },
    { address: "42 Gower Street, Bloomsbury, London", postcode: "WC1E 6BT" },
    { address: "1 Exhibition Road, South Kensington, London", postcode: "SW7 2AZ" },
    { address: "12 Exhibition Road, South Kensington, London", postcode: "SW7 2AZ" },
    { address: "58 Exhibition Road, South Kensington, London", postcode: "SW7 2AZ" },
    { address: "5 Strand, Westminster, London", postcode: "WC2N 5HR" },
    { address: "22 Strand, Westminster, London", postcode: "WC2N 5HR" },
    { address: "90 Strand, Westminster, London", postcode: "WC2R 0DW" },
    { address: "14 Mile End Road, Stepney, London", postcode: "E1 4NS" },
    { address: "63 Mile End Road, Stepney, London", postcode: "E1 4NS" },
    { address: "118 New Cross Road, New Cross, London", postcode: "SE14 6NW" },
    { address: "245 New Cross Road, New Cross, London", postcode: "SE14 6NW" },
    { address: "25 Old Castle Street, London", postcode: "E1 7NT" },
    { address: "103 Borough Road, Southwark, London", postcode: "SE1 0AA" },
    { address: "221 Baker Street, Marylebone, London", postcode: "NW1 6XE" },
  ];
  const normalisedManual = manual.trim().toLowerCase().replace(/\s+/g, " ");
  const addressSuggestions = normalisedManual.length < 2 ? [] : addressDirectory.filter(item => `${item.address} ${item.postcode}`.toLowerCase().includes(normalisedManual) || item.postcode.toLowerCase().replace(/\s/g, "").startsWith(normalisedManual.replace(/\s/g, ""))).slice(0, 7);
  const useCurrent = async () => {
    setLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          tr(language, "Location not enabled", "未开启定位", "未開啟定位"),
          tr(
            language,
            "You can still enter a location manually.",
            "你仍可以手动输入地点。",
            "你仍可以手動輸入地點。",
          ),
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const places = await Location.reverseGeocodeAsync(position.coords);
      const place = places[0];
      const label =
        [place?.district || place?.city, place?.region]
          .filter(Boolean)
          .join(", ") ||
        `${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`;
      onSelect(label);
      onClose();
    } catch {
      Alert.alert(
        tr(language, "Location unavailable", "无法获取定位", "無法取得定位"),
        tr(
          language,
          "Please enter your location manually.",
          "请手动输入地点。",
          "請手動輸入地點。",
        ),
      );
    } finally {
      setLoading(false);
    }
  };
  const quickLocations = [
    {
      value: "Central London",
      label: tr(language, "Central London", "伦敦市中心", "倫敦市中心"),
    },
    {
      value: "UCL, Bloomsbury",
      label: tr(
        language,
        "UCL, Bloomsbury",
        "伦敦大学学院，布卢姆斯伯里",
        "倫敦大學學院，布盧姆斯伯里",
      ),
    },
    {
      value: "Imperial College London",
      label: tr(
        language,
        "Imperial College London",
        "帝国理工学院",
        "帝國理工學院",
      ),
    },
    {
      value: "King’s College London",
      label: tr(
        language,
        "King’s College London",
        "伦敦国王学院",
        "倫敦國王學院",
      ),
    },
  ];
  return (
    <Sheet
      visible={visible}
      title={tr(language, "Choose location", "选择地点", "選擇地點")}
      onClose={onClose}
    >
      <View style={styles.locationSheet}>
        <Pressable style={styles.currentLocation} onPress={useCurrent}>
          <View style={styles.locationIcon}>
            <Ionicons name="navigate" size={23} color={palette.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.currentTitle}>
              {loading
                ? tr(
                    language,
                    "Finding your location…",
                    "正在获取位置…",
                    "正在取得位置…",
                  )
                : tr(
                    language,
                    "Use current location",
                    "使用当前位置",
                    "使用目前位置",
                  )}
            </Text>
            <Text style={styles.formDesc}>
              {tr(
                language,
                "Location is accessed only after you allow it.",
                "只有在你允许后才会读取定位。",
                "只有在你允許後才會讀取定位。",
              )}
            </Text>
          </View>
        </Pressable>
        <Text style={styles.orText}>
          {tr(language, "OR ENTER MANUALLY", "或手动输入", "或手動輸入")}
        </Text>
        <View style={styles.manualLocation}>
          <Ionicons name="search" size={18} color={palette.muted} />
          <TextInput
            style={styles.searchInput}
            value={manual}
            onChangeText={(value) => { setManual(value); setSelectedAddress(""); }}
            placeholder={tr(
              language,
              "London, postcode or address",
              "伦敦地点、邮编或地址",
              "倫敦地點、郵編或地址",
            )}
            placeholderTextColor="#8B98AD"
          />
        </View>
        {manual.trim().length > 0 ? <View style={styles.addressResults}><View style={styles.addressResultsHead}><Text style={styles.addressResultsTitle}>{tr(language, "Address suggestions", "地址建议", "地址建議")}</Text><Text style={styles.addressResultsCount}>{addressSuggestions.length} {tr(language, "results", "个结果", "個結果")}</Text></View>{addressSuggestions.length ? addressSuggestions.map(item => <Pressable key={`${item.address}-${item.postcode}`} style={[styles.addressSuggestion, selectedAddress === `${item.address}, ${item.postcode}` && styles.addressSuggestionSelected]} onPress={() => { const fullAddress = `${item.address}, ${item.postcode}`; setManual(fullAddress); setSelectedAddress(fullAddress); }}><View style={styles.addressNumber}><Ionicons name="home-outline" size={17} color={palette.blue} /></View><View style={{ flex: 1 }}><Text style={styles.addressSuggestionMain}>{item.address}</Text><Text style={styles.addressSuggestionPostcode}>{item.postcode}</Text></View>{selectedAddress === `${item.address}, ${item.postcode}` && <Ionicons name="checkmark-circle" size={20} color={palette.green} />}</Pressable>) : <View style={styles.addressNoResults}><Ionicons name="search-outline" size={21} color={palette.muted} /><Text style={styles.addressNoResultsText}>{tr(language, "Keep typing a London address or full postcode. House numbers will appear when available.", "请继续输入伦敦地址或完整邮编，可用的门牌号会显示出来。", "請繼續輸入倫敦地址或完整郵編，可用的門牌號會顯示出來。")}</Text></View>}</View> : <View style={styles.quickLocations}><Text style={styles.quickLocationsTitle}>{tr(language, "Popular London locations", "热门伦敦地点", "熱門倫敦地點")}</Text>{quickLocations.map((item) => (
            <Pressable
              key={item.value}
              style={styles.quickLocation}
              onPress={() => {
                onSelect(item.value);
                onClose();
              }}
            >
              <Ionicons
                name="location-outline"
                size={18}
                color={palette.blue}
              />
              <Text style={styles.menuText}>{item.label}</Text>
            </Pressable>
          ))}</View>}
        <Pressable
          style={[styles.primaryButton, !manual.trim() && { opacity: 0.45 }]}
          disabled={!manual.trim()}
          onPress={() => {
            onSelect(manual.trim());
            onClose();
          }}
        >
          <Text style={styles.primaryButtonText}>
            {tr(language, "Use this location", "使用此地点", "使用此地點")}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function Profile({
  language,
  onLanguage,
  onNavigate,
  darkMode,
  onToggleDarkMode,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  onNavigate: (tab: Tab) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  const networks = [
    { name: "WeChat", icon: "chatbubbles", color: "#19B45B" },
    { name: "Instagram", icon: "logo-instagram", color: "#C13584" },
    { name: "RedNote", icon: "book", color: "#EF3040" },
    { name: "Facebook", icon: "logo-facebook", color: "#1877F2" },
    { name: "TikTok", icon: "logo-tiktok", color: "#111111" },
    { name: "Douyin", icon: "musical-notes", color: "#27212B" },
  ];
  const [handles, setHandles] = useState<Record<string, string>>({
    WeChat: "studybuddy_uk",
    Instagram: "studybuddy.london",
    RedNote: "",
    Facebook: "",
    TikTok: "",
    Douyin: "",
  });
  const [socialVisible, setSocialVisible] = useState<Record<string, boolean>>({
    WeChat: true,
    Instagram: true,
    RedNote: false,
    Facebook: false,
    TikTok: false,
    Douyin: false,
  });
  const [profilePrivate, setProfilePrivate] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listingsOpen, setListingsOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedProfiles, setBlockedProfiles] = useState([friends[2].username]);
  const [activityNotifications, setActivityNotifications] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAudience, setPreviewAudience] = useState<"public" | "friend">(
    "public",
  );
  const [editOpen, setEditOpen] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState("");
  const [displayName, setDisplayName] = useState("Sophie Chen");
  const [username, setUsername] = useState("@studybuddy_uk");
  const [savedUsername, setSavedUsername] = useState("@studybuddy_uk");
  const [lastUsernameChange, setLastUsernameChange] = useState<Date | null>(
    null,
  );
  const [bio, setBio] = useState(
    "UCL student exploring London one great meal, event and new friendship at a time.",
  );
  const [interests, setInterests] = useState(
    "Travel, Food, Photography, Music",
  );
  const [interestDraft, setInterestDraft] = useState("");
  const tags = interests
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const suggestedInterests = [
    "Travel",
    "Food",
    "Photography",
    "Music",
    "Sports",
    "Films",
    "Gaming",
    "Art",
    "Reading",
    "Nightlife",
    "Volunteering",
    "City walks",
  ];
  const commonInterests = [
    ...suggestedInterests,
    "Cooking",
    "Fitness",
    "Football",
    "Basketball",
    "Running",
    "Yoga",
    "Dance",
    "Fashion",
    "Pets",
    "Languages",
    "Museums",
    "Theatre",
    "Hiking",
    "Board games",
    "K-pop",
    "Anime",
  ];
  const allInterestOptions = Array.from(
    new Set([...suggestedInterests, ...tags]),
  );
  const interestSuggestions = interestDraft.trim()
    ? commonInterests
        .filter(
          (item) =>
            item.toLowerCase().includes(interestDraft.trim().toLowerCase()) &&
            !tags.includes(item),
        )
        .slice(0, 5)
    : [];
  const usernameTaken =
    ["@londonlatte", "@danplays", "@citylily", "@techhoops"].includes(
      username.trim().toLowerCase(),
    ) || !/^@[a-z0-9_]{3,20}$/i.test(username.trim());
  const usernameChangeDue = lastUsernameChange
    ? new Date(lastUsernameChange.getTime() + 90 * 24 * 60 * 60 * 1000)
    : null;
  const usernameLocked = !!usernameChangeDue && usernameChangeDue > new Date();
  const usernameChanged = username !== savedUsername;
  const toggleInterest = (item: string) =>
    setInterests(
      tags.includes(item)
        ? tags.filter((tag) => tag !== item).join(", ")
        : [...tags, item].join(", "),
    );
  const addInterest = (item: string) => {
    const clean = item.trim();
    if (clean && !tags.some((tag) => tag.toLowerCase() === clean.toLowerCase()))
      setInterests([...tags, clean].join(", "));
    setInterestDraft("");
  };
  const saveProfile = () => {
    if (usernameChanged && !usernameLocked) {
      setSavedUsername(username);
      setLastUsernameChange(new Date());
    }
    setEditOpen(false);
  };
  const menus =
    language === "EN"
      ? [
          "Edit display name, bio & interests",
          "Friend requests and my friends",
          "My events",
          "My bookings",
          "My marketplace listings",
          "Settings",
        ]
      : language === "简体"
        ? [
            "编辑显示名称、简介和兴趣",
            "好友请求与我的好友",
            "我的活动",
            "我的预订",
            "我的二手商品",
            "设置",
          ]
        : [
            "編輯顯示名稱、簡介及興趣",
            "好友請求及我的好友",
            "我的活動",
            "我的預訂",
            "我的二手商品",
            "設定",
          ];
  const menuIcons = [
    "person-outline",
    "people-outline",
    "calendar-outline",
    "receipt-outline",
    "bag-outline",
    "settings-outline",
  ];
  const openProfileMenu = (index: number) => {
    if (index === 0) setEditOpen(true);
    if (index === 1) onNavigate("friends");
    if (index === 2) onNavigate("events");
    if (index === 3) onNavigate("bookings");
    if (index === 4) setListingsOpen(true);
    if (index === 5) setSettingsOpen(true);
  };
  const pickProfilePhoto = async (source?: PhotoSource) => {
    if (!source) {
      askPhotoSource(language, pickProfilePhoto);
      return;
    }
    const uris = await selectPhotoUris(language, source, {
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (uris[0]) setProfilePhoto(uris[0]);
  };
  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileTop}>
          <View style={styles.profilePhotoWrap}>
            {profilePhoto ? (
              <Image
                source={{ uri: profilePhoto }}
                style={styles.profilePhoto}
              />
            ) : (
              <View style={[styles.avatar, styles.profileAvatar]}>
                <Text style={styles.profileInitial}>S</Text>
              </View>
            )}
          </View>
          <Text style={styles.profileDisplayName}>{displayName}</Text>
          <Text style={styles.profileName}>{username}</Text>
          <Text style={styles.profileUni}>
            {tr(
              language,
              "University College London",
              "伦敦大学学院",
              "倫敦大學學院",
            )}
          </Text>
          <View style={styles.profileTags}>
            {tags.map((item) => (
              <Text key={item} style={styles.profileTag}>
                {item}
              </Text>
            ))}
          </View>
          <Pressable
            style={styles.viewProfileButton}
            onPress={() => setPreviewOpen(true)}
          >
            <Ionicons name="eye-outline" size={17} color={palette.blue} />
            <Text style={styles.viewProfileButtonText}>
              {tr(
                language,
                "View profile as others see it",
                "查看他人看到的个人资料",
                "查看他人看到的個人資料",
              )}
            </Text>
          </Pressable>
        </View>
        <View style={styles.profileMenuCard}>
          {menus.map((item, index) => (
            <Pressable
              key={item}
              style={styles.menuItem}
              onPress={() => openProfileMenu(index)}
            >
              <Ionicons
                name={menuIcons[index] as any}
                size={22}
                color={palette.blue}
              />
              <Text style={styles.menuText}>{item}</Text>
              <Ionicons name="chevron-forward" color={palette.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Sheet
        visible={previewOpen}
        title={tr(
          language,
          "Your public profile",
          "你的公开资料",
          "你的公開資料",
        )}
        onClose={() => setPreviewOpen(false)}
      >
        <ScrollView
          contentContainerStyle={styles.publicProfileBody}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.publicProfileHero}>
            {profilePhoto ? (
              <Image
                source={{ uri: profilePhoto }}
                style={styles.publicProfilePhoto}
              />
            ) : (
              <View
                style={[
                  styles.avatar,
                  styles.publicProfilePhoto,
                  { backgroundColor: "#DCEBFF" },
                ]}
              >
                <Text style={styles.profileInitial}>S</Text>
              </View>
            )}
            <Text style={styles.publicProfileName}>{displayName}</Text>
            <Text style={styles.friendUsername}>{username}</Text>
            <Text style={styles.profileUni}>
              {tr(
                language,
                "University College London · Verified student",
                "伦敦大学学院 · 已认证学生",
                "倫敦大學學院 · 已認證學生",
              )}
            </Text>
          </View>
          <View style={styles.profileAudienceTabs}>
            <Pressable
              style={[
                styles.profileAudienceTab,
                previewAudience === "public" && styles.profileAudienceTabActive,
              ]}
              onPress={() => setPreviewAudience("public")}
            >
              <Ionicons name="globe-outline" size={15} color={previewAudience === "public" ? "white" : palette.muted} />
              <Text style={[styles.profileAudienceText, previewAudience === "public" && styles.profileAudienceTextActive]}>{tr(language, "Public view", "陌生人视角", "陌生人視角")}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.profileAudienceTab,
                previewAudience === "friend" && styles.profileAudienceTabActive,
              ]}
              onPress={() => setPreviewAudience("friend")}
            >
              <Ionicons name="people-outline" size={15} color={previewAudience === "friend" ? "white" : palette.muted} />
              <Text style={[styles.profileAudienceText, previewAudience === "friend" && styles.profileAudienceTextActive]}>{tr(language, "Friend view", "好友视角", "好友視角")}</Text>
            </Pressable>
          </View>
          <View style={styles.profileSocialStats}>
            {[{ value: 128, label: tr(language, "Followers", "粉丝", "追蹤者") }, { value: 84, label: tr(language, "Following", "关注中", "追蹤中") }, { value: 36, label: tr(language, "Friends", "好友", "好友") }, { value: 7, label: tr(language, "Mutual", "共同好友", "共同好友") }].map((stat) => <View key={stat.label} style={styles.profileSocialStat}><Text style={styles.profileSocialStatValue}>{stat.value}</Text><Text style={styles.profileSocialStatLabel}>{stat.label}</Text></View>)}
          </View>
          {previewAudience === "friend" ? (
            <View style={styles.profileConnectionsCard}>
              <View style={styles.profileConnectionsHead}><View><Text style={styles.profileConnectionsTitle}>{tr(language, "Connections", "社交关系", "社交關係")}</Text><Text style={styles.profileConnectionsText}>{tr(language, "Accepted friends can see names and mutual connections.", "已接受的好友可以查看名单和共同好友。", "已接受的好友可以查看名單及共同好友。")}</Text></View><Ionicons name="lock-open-outline" size={19} color={palette.green} /></View>
              <View style={styles.profileConnectionFaces}>{friends.slice(0, 3).map((friend, index) => <View key={friend.username} style={[styles.avatar, styles.profileConnectionAvatar, { backgroundColor: friend.color, marginLeft: index ? -8 : 0 }]}><Text style={styles.avatarText}>{friend.initials}</Text></View>)}<Text style={styles.profileConnectionNames}>Emma, Daniel, Lily +33</Text></View>
              <Pressable style={styles.profileConnectionLink}><Text style={styles.profileConnectionLinkText}>{tr(language, "View friends, followers and following", "查看好友、粉丝和关注列表", "查看好友、追蹤者及追蹤中名單")}</Text><Ionicons name="chevron-forward" size={17} color={palette.blue} /></Pressable>
            </View>
          ) : (
            <View style={styles.profileConnectionsLocked}><Ionicons name="lock-closed-outline" size={18} color={palette.muted} /><Text style={styles.profileConnectionsLockedText}>{tr(language, "People who are not friends can see totals only. Names and connection lists stay private.", "非好友只能看到人数，姓名和社交关系列表保持私密。", "非好友只能看到人數，姓名及社交關係名單保持私隱。")}</Text></View>
          )}
          <Text style={styles.friendSectionTitle}>
            {tr(language, "Bio", "个人简介", "個人簡介")}
          </Text>
          <Text style={styles.publicBio}>{bio}</Text>
          <Text style={styles.friendSectionTitle}>
            {tr(language, "Interests", "兴趣爱好", "興趣愛好")}
          </Text>
          <View style={styles.profileTags}>
            {tags.map((item) => (
              <Text key={item} style={styles.profileTag}>
                {item}
              </Text>
            ))}
          </View>
          <View style={styles.profileActivityHead}>
            <Text style={styles.friendSectionTitle}>
              {tr(
                language,
                "Recent activities & reviews",
                "最近活动与评价",
                "最近活動及評價",
              )}
            </Text>
            <Ionicons name="shield-checkmark" size={18} color={palette.green} />
          </View>
          <View style={styles.profileActivityCard}>
            <Image
              source={{ uri: restaurants[1].image }}
              style={styles.profileActivityImage}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>Dishoom · 4.8 ★</Text>
              <Text style={styles.friendInterests}>
                {tr(
                  language,
                  "Restaurant review · “Perfect for catching up with friends.”",
                  "餐厅评价 · “很适合和朋友聚会。”",
                  "餐廳評價 ·「很適合和朋友聚會。」",
                )}
              </Text>
            </View>
          </View>
          <View style={styles.profileActivityCard}>
            <Image
              source={{ uri: events[1].image }}
              style={styles.profileActivityImage}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>
                {tr(
                  language,
                  "Outdoor Movie Night · 5.0 ★",
                  "户外电影之夜 · 5.0 ★",
                  "戶外電影之夜 · 5.0 ★",
                )}
              </Text>
              <Text style={styles.friendInterests}>
                {tr(
                  language,
                  "Attended event · Review shared with friends",
                  "已参加活动 · 评价与好友分享",
                  "已參加活動 · 評價與好友分享",
                )}
              </Text>
            </View>
          </View>
          <View style={styles.privacyIntro}>
            <Ionicons
              name="information-circle"
              size={20}
              color={palette.blue}
            />
            <Text style={styles.privacyIntroText}>
              {tr(
                language,
                "This preview shows what accepted friends can see. Your privacy settings still control individual details and activities.",
                "此预览展示已接受好友可见的内容。各项资料与活动仍受隐私设置控制。",
                "此預覽展示已接受好友可見的內容。各項資料及活動仍受私隱設定控制。",
              )}
            </Text>
          </View>
        </ScrollView>
      </Sheet>
      <Sheet
        visible={editOpen}
        title={tr(language, "Edit profile", "编辑个人资料", "編輯個人資料")}
        onClose={() => setEditOpen(false)}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <View style={styles.editPhotoButton}>
            {profilePhoto ? (
              <Image
                source={{ uri: profilePhoto }}
                style={styles.editPhotoPreview}
              />
            ) : (
              <View style={styles.editPhotoPreview}>
                <Ionicons
                  name="camera-outline"
                  size={29}
                  color={palette.blue}
                />
              </View>
            )}
            <Text style={styles.viewProfileButtonText}>
              {tr(
                language,
                "Upload or change profile photo",
                "上传或更换头像",
                "上載或更換頭像",
              )}
            </Text>
            <PhotoSourceActions language={language} onCamera={() => pickProfilePhoto("camera")} onLibrary={() => pickProfilePhoto("library")} />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              {tr(language, "Display name", "显示名称", "顯示名稱")}
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Sophie Chen"
              placeholderTextColor="#A1ADBE"
            />
          </View>
          <View
            style={[
              styles.field,
              usernameTaken && !usernameLocked && { borderColor: palette.coral },
              usernameLocked && styles.usernameLockedField,
            ]}
          >
            <Text style={styles.fieldLabel}>
              {tr(language, "Username", "用户名", "用戶名稱")}
            </Text>
            <TextInput
              value={username}
              editable={!usernameLocked}
              onChangeText={(value) =>
                setUsername(value.startsWith("@") ? value : `@${value}`)
              }
              autoCapitalize="none"
              placeholder="@username"
              placeholderTextColor="#A1ADBE"
            />
            <View style={styles.usernameStatus}>
              <Ionicons
                name={usernameLocked ? "lock-closed" : usernameTaken ? "close-circle" : "checkmark-circle"}
                size={16}
                color={usernameLocked ? palette.blue : usernameTaken ? palette.coral : palette.green}
              />
              <Text
                style={[
                  styles.usernameStatusText,
                  { color: usernameLocked ? palette.blue : usernameTaken ? palette.coral : palette.green },
                ]}
              >
                {usernameLocked
                  ? tr(language, `Next username change: ${usernameChangeDue?.toLocaleDateString("en-GB")}`, `下次可更改日期：${usernameChangeDue?.toLocaleDateString("zh-CN")}`, `下次可更改日期：${usernameChangeDue?.toLocaleDateString("zh-TW")}`)
                  : usernameTaken
                  ? tr(
                      language,
                      "Username is taken or invalid",
                      "用户名已被使用或格式无效",
                      "用戶名稱已被使用或格式無效",
                    )
                  : tr(
                      language,
                      "Username is available",
                      "用户名可用",
                      "用戶名稱可用",
                    )}
              </Text>
            </View>
          </View>
          <View style={styles.usernamePolicy}><Ionicons name="time-outline" size={18} color={palette.blue} /><Text style={styles.usernamePolicyText}>{tr(language, "For account safety, your username can only be changed once every 3 months.", "为保障账号安全，用户名每3个月只能更改一次。", "為保障帳戶安全，用戶名稱每3個月只能更改一次。")}</Text></View>
          <View style={[styles.field, styles.textAreaField]}>
            <Text style={styles.fieldLabel}>
              {tr(language, "Bio", "个人简介", "個人簡介")}
            </Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              multiline
              style={styles.textAreaInput}
              placeholder={tr(
                language,
                "Tell other students a little about you…",
                "向其他同学简单介绍自己…",
                "向其他同學簡單介紹自己…",
              )}
              placeholderTextColor="#A1ADBE"
            />
          </View>
          <Text style={styles.formSectionTitle}>
            {tr(language, "Hobbies and interests", "兴趣爱好", "興趣愛好")}
          </Text>
          <Text style={styles.fieldHint}>
            {tr(
              language,
              "Choose tags that help like-minded students find you.",
              "选择兴趣标签，帮助志同道合的同学找到你。",
              "選擇興趣標籤，幫助志同道合的同學找到你。",
            )}
          </Text>
          <View style={styles.interestTagPicker}>
            {allInterestOptions.map((item) => (
              <Pressable
                key={item}
                style={[
                  styles.interestTagOption,
                  tags.includes(item) && styles.interestTagOptionActive,
                ]}
                onPress={() => toggleInterest(item)}
              >
                <Text
                  style={[
                    styles.interestTagOptionText,
                    tags.includes(item) && styles.interestTagOptionTextActive,
                  ]}
                >
                  {item}
                </Text>
                {tags.includes(item) && (
                  <Ionicons name="checkmark" size={13} color="white" />
                )}
              </Pressable>
            ))}
          </View>
          <View style={styles.customInterestRow}>
            <TextInput
              style={styles.customInterestInput}
              value={interestDraft}
              onChangeText={setInterestDraft}
              placeholder={tr(
                language,
                "Add another interest",
                "添加其他兴趣",
                "加入其他興趣",
              )}
              placeholderTextColor="#A1ADBE"
            />
            <Pressable
              disabled={!interestDraft.trim()}
              style={[
                styles.customInterestAdd,
                !interestDraft.trim() && { opacity: 0.4 },
              ]}
              onPress={() => addInterest(interestDraft)}
            >
              <Ionicons name="add" size={19} color="white" />
            </Pressable>
          </View>
          {interestSuggestions.length > 0 && <View style={styles.interestSuggestions}><Text style={styles.interestSuggestionsLabel}>{tr(language, "Suggested interests", "推荐兴趣", "建議興趣")}</Text>{interestSuggestions.map(item => <Pressable key={item} style={styles.interestSuggestion} onPress={() => addInterest(item)}><Ionicons name="add-circle-outline" size={17} color={palette.blue} /><Text style={styles.interestSuggestionText}>{item}</Text></Pressable>)}</View>}
          <Pressable
            disabled={usernameTaken || (usernameChanged && usernameLocked)}
            style={[styles.primaryButton, (usernameTaken || (usernameChanged && usernameLocked)) && { opacity: 0.45 }]}
            onPress={saveProfile}
          >
            <Text style={styles.primaryButtonText}>
              {tr(language, "Save profile", "保存资料", "儲存資料")}
            </Text>
          </Pressable>
        </ScrollView>
      </Sheet>
      <Sheet
        visible={privacyOpen}
        title={tr(language, "Privacy and safety", "隐私与安全", "私隱及安全")}
        onClose={() => setPrivacyOpen(false)}
      >
        <ScrollView
          contentContainerStyle={styles.privacySheetBody}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.privacyIntro}>
            <Ionicons name="lock-closed" size={21} color={palette.green} />
            <Text style={styles.privacyIntroText}>
              {tr(
                language,
                "Your full name and private details stay hidden until you accept a friend request. You remain in control of every linked username.",
                "在你接受好友请求前，真实姓名与私密信息会一直隐藏。每个社交账号都由你自主控制。",
                "在你接受好友請求前，真實姓名及私密資料會一直隱藏。每個社交帳號都由你自主控制。",
              )}
            </Text>
          </View>
          <View style={styles.profilePrivacyCard}>
            <View style={styles.profilePrivacyHead}>
              <Ionicons
                name="shield-checkmark-outline"
                size={23}
                color={palette.blue}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>
                  {tr(
                    language,
                    "Profile visibility",
                    "个人资料可见性",
                    "個人資料可見度",
                  )}
                </Text>
                <Text style={styles.formDesc}>
                  {tr(
                    language,
                    "Choose whether other verified students can discover your limited profile.",
                    "选择其他已验证学生是否可发现你的有限资料。",
                    "選擇其他已驗證學生是否可搜尋你的有限資料。",
                  )}
                </Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: profilePrivate }}
                style={[styles.toggle, profilePrivate && styles.toggleOn]}
                onPress={() => setProfilePrivate(!profilePrivate)}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    profilePrivate && styles.toggleKnobOn,
                  ]}
                />
              </Pressable>
            </View>
            <Text style={styles.privateModeText}>
              {profilePrivate
                ? tr(
                    language,
                    "Private profile — only accepted friends can view it.",
                    "私人资料——仅已接受的好友可以查看。",
                    "私人資料——只有已接受的好友可以查看。",
                  )
                : tr(
                    language,
                    "Discoverable profile — students can find you by university and interests.",
                    "可发现资料——同学可按大学和兴趣找到你。",
                    "可搜尋資料——同學可按大學和興趣找到你。",
                  )}
            </Text>
          </View>
          <View style={styles.profilePrivacyCard}>
            <View style={styles.profilePrivacyHead}>
              <Ionicons
                name="at-circle-outline"
                size={23}
                color={palette.blue}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>
                  {tr(
                    language,
                    "Linked social accounts",
                    "已关联社交账号",
                    "已連結社交帳號",
                  )}
                </Text>
                <Text style={styles.formDesc}>
                  {tr(
                    language,
                    "Add a username or profile link, then choose whether accepted friends can see it.",
                    "添加用户名或主页链接，并选择是否向好友显示。",
                    "加入用戶名稱或個人頁面連結，並選擇是否向好友顯示。",
                  )}
                </Text>
              </View>
            </View>
            {networks.map((network) => (
              <View key={network.name} style={styles.socialEditor}>
                <View
                  style={[
                    styles.socialLogo,
                    { backgroundColor: network.color },
                  ]}
                >
                  <Ionicons
                    name={network.icon as any}
                    size={18}
                    color="white"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.socialEditorName}>{network.name}</Text>
                  <TextInput
                    style={styles.socialInput}
                    value={handles[network.name]}
                    onChangeText={(value) =>
                      setHandles({ ...handles, [network.name]: value })
                    }
                    placeholder={tr(
                      language,
                      "Username or profile URL",
                      "用户名或主页链接",
                      "用戶名稱或個人頁面連結",
                    )}
                    placeholderTextColor="#A0AABB"
                    autoCapitalize="none"
                  />
                </View>
                <Pressable
                  accessibilityLabel={tr(
                    language,
                    "Toggle username visibility",
                    "切换用户名可见性",
                    "切換用戶名稱可見性",
                  )}
                  style={[
                    styles.visibilityButton,
                    socialVisible[network.name] && handles[network.name]
                      ? styles.visibilityOn
                      : undefined,
                  ]}
                  disabled={!handles[network.name]}
                  onPress={() =>
                    setSocialVisible({
                      ...socialVisible,
                      [network.name]: !socialVisible[network.name],
                    })
                  }
                >
                  <Ionicons
                    name={
                      socialVisible[network.name] && handles[network.name]
                        ? "eye"
                        : "eye-off"
                    }
                    size={18}
                    color={
                      socialVisible[network.name] && handles[network.name]
                        ? "white"
                        : palette.muted
                    }
                  />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      </Sheet>
      <Sheet
        visible={blockedOpen}
        title={tr(language, "Blocked people", "已屏蔽用户", "已封鎖用戶")}
        onClose={() => setBlockedOpen(false)}
      >
        <ScrollView contentContainerStyle={styles.blockedPeopleBody}>
          <View style={styles.privacyIntro}>
            <Ionicons name="shield-checkmark-outline" size={20} color={palette.blue} />
            <Text style={styles.privacyIntroText}>
              {tr(language, "People you block cannot view your profile, message you or find you in friend suggestions. They are not notified if you unblock them.", "被你屏蔽的人无法查看你的资料、向你发送消息或在好友推荐中找到你。解除屏蔽时对方不会收到通知。", "被你封鎖的人無法查看你的資料、向你傳送訊息或在好友推薦中找到你。解除封鎖時對方不會收到通知。")}
            </Text>
          </View>
          {blockedProfiles.length ? blockedProfiles.map((username) => {
            const person = friends.find((friend) => friend.username === username);
            if (!person) return null;
            return <View key={username} style={styles.blockedPersonRow}>
              <View style={[styles.avatar, { backgroundColor: person.color }]}><Text style={styles.avatarText}>{person.initials}</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.friendName}>{person.fullName}</Text><Text style={styles.friendUni}>{person.username} · {person.uni}</Text></View>
              <Pressable style={styles.unblockButton} onPress={() => setBlockedProfiles(blockedProfiles.filter((item) => item !== username))}><Text style={styles.unblockButtonText}>{tr(language, "Unblock", "解除屏蔽", "解除封鎖")}</Text></Pressable>
            </View>;
          }) : <View style={styles.empty}><Ionicons name="people-outline" size={38} color={palette.blue} /><Text style={styles.emptyTitle}>{tr(language, "No blocked people", "没有已屏蔽用户", "沒有已封鎖用戶")}</Text><Text style={styles.emptyText}>{tr(language, "Accounts you block will appear here.", "你屏蔽的账号会显示在这里。", "你封鎖的帳戶會顯示在這裡。")}</Text></View>}
        </ScrollView>
      </Sheet>
      <Sheet
        visible={listingsOpen}
        title={tr(language, "My marketplace listings", "我的二手商品", "我的二手商品")}
        onClose={() => setListingsOpen(false)}
      >
        <ScrollView contentContainerStyle={styles.settingsBody}>
          <View style={styles.listingSummaryCard}><View><Text style={styles.listingSummaryValue}>2</Text><Text style={styles.listingSummaryLabel}>{tr(language, "Active listings", "上架商品", "上架商品")}</Text></View><View><Text style={styles.listingSummaryValue}>£34</Text><Text style={styles.listingSummaryLabel}>{tr(language, "Estimated earnings", "预计收入", "預計收入")}</Text></View></View>
          {[{ name: "Compact desk lamp", price: "£18", status: tr(language, "Under review", "审核中", "審核中") }, { name: "Statistics textbook", price: "£16", status: tr(language, "Live", "已上架", "已上架") }].map((item) => <Pressable key={item.name} style={styles.profileListingRow}><View style={styles.profileListingIcon}><Ionicons name="bag-handle-outline" size={20} color={palette.blue} /></View><View style={{ flex: 1 }}><Text style={styles.friendName}>{item.name}</Text><Text style={styles.friendUni}>{item.status}</Text></View><Text style={styles.profileListingPrice}>{item.price}</Text><Ionicons name="chevron-forward" size={17} color={palette.muted} /></Pressable>)}
        </ScrollView>
      </Sheet>
      <Sheet
        visible={settingsOpen}
        title={tr(language, "Settings", "设置", "設定")}
        onClose={() => setSettingsOpen(false)}
      >
        <ScrollView contentContainerStyle={styles.settingsBody}>
          <Text style={[styles.settingsSectionLabel, styles.settingsFirstSectionLabel]}>{tr(language, "Privacy and safety", "隐私与安全", "私隱及安全")}</Text>
          <Pressable style={styles.settingsPrivacyLink} onPress={() => { setSettingsOpen(false); setPrivacyOpen(true); }}>
            <View style={styles.settingsPrivacyIcon}><Ionicons name="shield-checkmark" size={26} color={palette.blue} /></View>
            <View style={styles.settingsPrivacyContent}>
              <Text style={styles.settingsPrivacyTitle}>{tr(language, "Manage your privacy", "管理隐私", "管理私隱")}</Text>
              <Text style={styles.settingsPrivacyText}>{tr(language, "Control profile visibility and which linked social accounts friends can see.", "管理资料可见性以及好友可见的已绑定社交账号。", "管理資料可見度以及好友可見的已連結社交帳號。")}</Text>
              <View style={styles.settingsPrivacyMetaRow}>
                <View style={styles.settingsPrivacyBadge}><Ionicons name="eye-outline" size={13} color="#2878C8" /><Text style={styles.settingsPrivacyBadgeText}>{tr(language, "Discoverable", "可发现", "可搜尋")}</Text></View>
                <View style={styles.settingsPrivacyBadge}><Ionicons name="link-outline" size={13} color="#2878C8" /><Text style={styles.settingsPrivacyBadgeText}>{tr(language, "Social accounts", "社交账号", "社交帳號")}</Text></View>
              </View>
            </View>
            <View style={styles.settingsChevron}><Ionicons name="chevron-forward" size={20} color={palette.blue} /></View>
          </Pressable>
          <Text style={styles.settingsSectionLabel}>{tr(language, "Blocked accounts", "已屏蔽账号", "已封鎖帳號")}</Text>
          <Pressable style={styles.settingsBlockedLink} onPress={() => { setSettingsOpen(false); setBlockedOpen(true); }}>
            <View style={styles.settingsBlockedIcon}><Ionicons name="ban-outline" size={23} color={palette.coral} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsRowTitle}>{tr(language, "Blocked people", "已屏蔽用户", "已封鎖用戶")}</Text>
              <Text style={styles.settingsRowText}>{tr(language, `${blockedProfiles.length} blocked · Review or unblock accounts`, `${blockedProfiles.length}名已屏蔽用户 · 查看或解除屏蔽`, `${blockedProfiles.length}名已封鎖用戶 · 查看或解除封鎖`)}</Text>
            </View>
            <View style={styles.settingsBlockedCount}><Text style={styles.settingsBlockedCountText}>{blockedProfiles.length}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={palette.muted} />
          </Pressable>
          <Text style={styles.settingsSectionLabel}>{tr(language, "App preferences", "应用偏好", "應用程式偏好")}</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingsRow}><View style={styles.settingsIcon}><Ionicons name={darkMode ? "moon" : "sunny-outline"} size={20} color={palette.blue} /></View><View style={{ flex: 1 }}><Text style={styles.settingsRowTitle}>{tr(language, "Appearance", "外观", "外觀")}</Text><Text style={styles.settingsRowText}>{darkMode ? tr(language, "Dark mode", "深色模式", "深色模式") : tr(language, "Light mode", "浅色模式", "淺色模式")}</Text></View><Pressable accessibilityRole="switch" accessibilityState={{ checked: darkMode }} style={[styles.toggle, darkMode && styles.toggleOn]} onPress={onToggleDarkMode}><View style={[styles.toggleKnob, darkMode && styles.toggleKnobOn]} /></Pressable></View>
            <View style={styles.settingsRow}><View style={styles.settingsIcon}><Ionicons name="notifications-outline" size={20} color={palette.blue} /></View><View style={{ flex: 1 }}><Text style={styles.settingsRowTitle}>{tr(language, "Activity notifications", "动态通知", "動態通知")}</Text><Text style={styles.settingsRowText}>{tr(language, "Friends, bookings and event updates", "好友、预订和活动更新", "好友、預訂及活動更新")}</Text></View><Pressable accessibilityRole="switch" accessibilityState={{ checked: activityNotifications }} style={[styles.toggle, activityNotifications && styles.toggleOn]} onPress={() => setActivityNotifications(!activityNotifications)}><View style={[styles.toggleKnob, activityNotifications && styles.toggleKnobOn]} /></Pressable></View>
          </View>
          <Text style={styles.settingsSectionLabel}>{tr(language, "Language", "语言", "語言")}</Text>
          <View style={styles.settingsLanguageRow}>{(["EN", "简体", "繁體"] as Language[]).map((item) => <Pressable key={item} style={[styles.settingsLanguageButton, language === item && styles.settingsLanguageButtonActive]} onPress={() => onLanguage(item)}><Text style={[styles.settingsLanguageText, language === item && styles.settingsLanguageTextActive]}>{({ EN: "English", 简体: "简体中文", 繁體: "繁體中文" } as Record<Language, string>)[item]}</Text>{language === item && <Ionicons name="checkmark-circle" size={16} color="white" />}</Pressable>)}</View>
          <Text style={styles.settingsSectionLabel}>{tr(language, "Account", "账户", "帳戶")}</Text>
          <Pressable style={styles.logoutButton} onPress={() => Alert.alert(tr(language, "Log out?", "退出登录？", "登出？"), tr(language, "You can sign back in at any time.", "你可以随时重新登录。", "你可以隨時重新登入。"), [{ text: tr(language, "Cancel", "取消", "取消"), style: "cancel" }, { text: tr(language, "Log out", "退出登录", "登出"), onPress: () => Alert.alert(tr(language, "Logged out", "已退出登录", "已登出")) }])}><Ionicons name="log-out-outline" size={20} color={palette.blue} /><Text style={styles.logoutButtonText}>{tr(language, "Log out", "退出登录", "登出")}</Text></Pressable>
          <View style={styles.dangerZone}><Text style={styles.dangerZoneTitle}>{tr(language, "Danger zone", "危险操作", "危險操作")}</Text><Text style={styles.dangerZoneText}>{tr(language, "Deleting your account permanently removes your profile, reviews and activity history.", "删除账户将永久移除你的资料、评价和活动记录。", "刪除帳戶將永久移除你的資料、評價及活動記錄。")}</Text><Pressable style={styles.deleteAccountButton} onPress={() => Alert.alert(tr(language, "Delete your account?", "删除账户？", "刪除帳戶？"), tr(language, "This cannot be undone. Continue only if you want to permanently delete all account data.", "此操作无法撤销。仅在你确定要永久删除所有账户数据时继续。", "此操作無法撤銷。只有在你確定要永久刪除所有帳戶資料時繼續。"), [{ text: tr(language, "Cancel", "取消", "取消"), style: "cancel" }, { text: tr(language, "Continue", "继续", "繼續"), style: "destructive", onPress: () => Alert.alert(tr(language, "Final confirmation", "最终确认", "最終確認"), tr(language, "Are you absolutely sure? Your account and data will be scheduled for permanent deletion.", "你确定吗？你的账户和数据将安排永久删除。", "你確定嗎？你的帳戶及資料將安排永久刪除。"), [{ text: tr(language, "Keep my account", "保留账户", "保留帳戶"), style: "cancel" }, { text: tr(language, "Delete permanently", "永久删除", "永久刪除"), style: "destructive", onPress: () => Alert.alert(tr(language, "Deletion requested", "已申请删除", "已申請刪除"), tr(language, "Your request has been sent to the UNIMATE team for secure processing.", "你的申请已发送给UNIMATE团队进行安全处理。", "你的申請已傳送給UNIMATE團隊進行安全處理。")) }]) }])}><Ionicons name="trash-outline" size={19} color={palette.coral} /><Text style={styles.deleteAccountText}>{tr(language, "Delete account", "删除账户", "刪除帳戶")}</Text></Pressable></View>
        </ScrollView>
      </Sheet>
    </>
  );
}

function EventDateField({ language, value, onChange }: { language: Language; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }, []);
  const latestDate = useMemo(() => { const date = new Date(today); date.setFullYear(date.getFullYear() + 1); return date; }, [today]);
  const selectedDate = dateFromKey(value);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const years = [today.getFullYear(), latestDate.getFullYear()];
  const monthNames = Array.from({ length: 12 }, (_, index) => new Date(2026, index, 1).toLocaleDateString(language === "EN" ? "en-GB" : language === "简体" ? "zh-CN" : "zh-TW", { month: "short" }));
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const days = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const weekdays = language === "EN" ? ["M", "T", "W", "T", "F", "S", "S"] : ["一", "二", "三", "四", "五", "六", "日"];
  const firstAvailableMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastAvailableMonth = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
  return (
    <View style={styles.eventDateField}>
      <Text style={styles.fieldLabel}>{tr(language, "Date", "日期", "日期")}</Text>
      <Pressable style={styles.eventDateButton} onPress={() => setOpen(!open)}>
        <View style={styles.eventDateButtonCopy}><Ionicons name="calendar-outline" size={18} color={palette.blue} /><Text style={styles.eventDateButtonText}>{formatBookingDate(value, language)}</Text></View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={17} color={palette.blue} />
      </Pressable>
      {open && <View style={styles.eventCalendarPanel}>
        <View style={styles.eventCalendarWindowNote}><Ionicons name="information-circle-outline" size={16} color={palette.blue} /><Text style={styles.eventCalendarWindowText}>{tr(language, "Events can be scheduled up to 12 months ahead.", "活动最多可提前12个月安排。", "活動最多可提前12個月安排。")}</Text></View>
        <Text style={styles.eventCalendarPickerLabel}>{tr(language, "Year", "年份", "年份")}</Text>
        <View style={styles.eventCalendarYearRow}>{years.map(year => <Pressable key={year} style={[styles.eventCalendarChoice, styles.eventCalendarYearChoice, visibleMonth.getFullYear() === year && styles.eventCalendarChoiceActive]} onPress={() => { const month = year === today.getFullYear() ? Math.max(visibleMonth.getMonth(), today.getMonth()) : Math.min(visibleMonth.getMonth(), latestDate.getMonth()); setVisibleMonth(new Date(year, month, 1)); }}><Text style={[styles.eventCalendarChoiceText, visibleMonth.getFullYear() === year && styles.eventCalendarChoiceTextActive]}>{year}</Text></Pressable>)}</View>
        <Text style={styles.eventCalendarPickerLabel}>{tr(language, "Month", "月份", "月份")}</Text>
        <View style={styles.eventCalendarMonthGrid}>{monthNames.map((month, index) => { const monthStart = new Date(visibleMonth.getFullYear(), index, 1); const disabled = monthStart < firstAvailableMonth || monthStart > lastAvailableMonth; return <Pressable key={`${month}-${index}`} disabled={disabled} style={[styles.eventCalendarMonthChoice, visibleMonth.getMonth() === index && styles.eventCalendarChoiceActive, disabled && styles.eventCalendarChoiceDisabled]} onPress={() => setVisibleMonth(monthStart)}><Text style={[styles.eventCalendarChoiceText, visibleMonth.getMonth() === index && styles.eventCalendarChoiceTextActive, disabled && styles.calendarDayTextUnavailable]}>{month}</Text></Pressable>; })}</View>
        <View style={styles.eventCalendarDivider} />
        <View style={styles.weekRow}>{weekdays.map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}</View>
        <View style={styles.calendarGrid}>{days.map((day, index) => {
          if (day === null) return <View key={`blank-${index}`} style={styles.calendarDay} />;
          const candidate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
          const disabled = candidate < today || candidate > latestDate;
          const key = dateKey(candidate);
          const selected = key === value;
          return <Pressable key={key} disabled={disabled} style={[styles.calendarDay, disabled && styles.calendarDayUnavailable, selected && styles.calendarDaySelected]} onPress={() => { onChange(key); setOpen(false); }}><Text style={[styles.calendarDayText, disabled && styles.calendarDayTextUnavailable, selected && styles.calendarDayTextSelected]}>{day}</Text></Pressable>;
        })}</View>
      </View>}
    </View>
  );
}

function EventTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hour, minute] = value.split(":").map(Number);
  const updateHour = (amount: number) => onChange(`${String((hour + amount + 24) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  const updateMinute = (amount: number) => onChange(`${String(hour).padStart(2, "0")}:${String((minute + amount + 60) % 60).padStart(2, "0")}`);
  return <View style={styles.eventTimeField}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Pressable style={styles.eventDateButton} onPress={() => setOpen(!open)}><View style={styles.eventDateButtonCopy}><Ionicons name="time-outline" size={18} color={palette.blue} /><Text style={styles.eventTimeValue}>{value}</Text></View><Ionicons name={open ? "chevron-up" : "chevron-down"} size={17} color={palette.blue} /></Pressable>
    {open && <View style={styles.eventTimePanel}>
      <View style={styles.eventTimeHeader}><Text style={styles.eventTimePanelTitle}>Set time</Text><Text style={styles.eventTimePanelHint}>24-hour clock · 5-minute intervals</Text></View>
      <View style={styles.eventTimeStepperRow}>
        <View style={styles.eventTimeSegment}><Text style={styles.eventTimeSegmentLabel}>Hour</Text><View style={styles.eventTimeStepper}><Pressable accessibilityLabel="Previous hour" style={styles.eventTimeStepButton} onPress={() => updateHour(-1)}><Ionicons name="remove" size={19} color={palette.blue} /></Pressable><Text style={styles.eventTimeStepValue}>{String(hour).padStart(2, "0")}</Text><Pressable accessibilityLabel="Next hour" style={styles.eventTimeStepButton} onPress={() => updateHour(1)}><Ionicons name="add" size={19} color={palette.blue} /></Pressable></View></View>
        <Text style={styles.eventTimeColon}>:</Text>
        <View style={styles.eventTimeSegment}><Text style={styles.eventTimeSegmentLabel}>Minute</Text><View style={styles.eventTimeStepper}><Pressable accessibilityLabel="Previous five minutes" style={styles.eventTimeStepButton} onPress={() => updateMinute(-5)}><Ionicons name="remove" size={19} color={palette.blue} /></Pressable><Text style={styles.eventTimeStepValue}>{String(minute).padStart(2, "0")}</Text><Pressable accessibilityLabel="Next five minutes" style={styles.eventTimeStepButton} onPress={() => updateMinute(5)}><Ionicons name="add" size={19} color={palette.blue} /></Pressable></View></View>
      </View>
      <Pressable style={styles.eventTimeDone} onPress={() => setOpen(false)}><Ionicons name="checkmark" size={16} color="white" /><Text style={styles.eventTimeDoneText}>Use {value}</Text></Pressable>
    </View>}
  </View>;
}

function EventModal({
  visible,
  onClose,
  onViewMyEvents,
  language,
}: {
  visible: boolean;
  onClose: () => void;
  onViewMyEvents: () => void;
  language: Language;
}) {
  const categoryScrollRef = useRef<NativeScrollView>(null);
  const [submitted, setSubmitted] = useState(false);
  const [paymentMode, setPaymentMode] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"Card" | "Apple Pay" | "WeChat Pay">("Card");
  const [ticketPrice, setTicketPrice] = useState("");
  const [eventCapacity, setEventCapacity] = useState(50);
  const [eventDate, setEventDate] = useState(() => bookingDateFromToday(7));
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("21:00");
  const [lastEntryTime, setLastEntryTime] = useState("19:00");
  const [category, setCategory] = useState("Parties");
  const [photo, setPhoto] = useState<string | null>(null);
  const categories = [
    "Sports",
    "Parties",
    "House parties",
    "Culture",
    "Trips",
    "Other",
  ];
  const pickPhoto = async (source: PhotoSource) => { const uris = await selectPhotoUris(language, source, { allowsEditing: true, aspect: [16, 9], quality: .8 }); if (uris[0]) setPhoto(uris[0]); };
  const close = () => {
    setSubmitted(false);
    setPaymentMode(false);
    onClose();
  };
  const fields =
    language === "EN"
      ? [
          "Event name",
          "Date",
          "Start time",
          "End time",
          "Location / full address",
          "Summary of the event",
          "Cost / ticket price",
          "Last entry time",
        ]
      : language === "简体"
        ? [
            "活动名称",
            "日期",
            "开始时间",
            "结束时间",
            "地点 / 完整地址",
            "活动简介",
            "费用 / 票价",
            "最晚入场时间",
          ]
        : [
            "活動名稱",
            "日期",
            "開始時間",
            "結束時間",
            "地點 / 完整地址",
            "活動簡介",
            "費用 / 票價",
            "最晚入場時間",
          ];
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHead}>
          <Pressable onPress={close}>
            <Ionicons name="close" size={28} color={palette.ink} />
          </Pressable>
          <Text style={styles.modalTitle}>
            {tr(language, "Create an event", "发布活动", "發佈活動")}
          </Text>
          <View style={{ width: 28 }} />
        </View>
        {submitted ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: "#E8F8EF" }]}>
              <Ionicons name="checkmark" size={46} color={palette.green} />
            </View>
            <Text style={styles.emptyTitle}>
              {tr(language, "Payment received", "已收到付款", "已收到付款")}
            </Text>
            <Text style={styles.emptyText}>
              {tr(
                language,
                "Your £10 submission has been sent for verification. The event stays private until the UNIMATE admin team approves it.",
                "你的£10提交费已支付，活动已送审。在 UNIMATE 管理团队批准前，活动不会公开。",
                "你的£10提交費已支付，活動已送審。在 UNIMATE 管理團隊批准前，活動不會公開。",
              )}
            </Text>
            <View style={styles.approvalNotificationNote}>
              <Ionicons name="notifications-outline" size={19} color={palette.blue} />
              <Text style={styles.approvalNotificationText}>
                {tr(
                  language,
                  "We will notify you when the event is approved and published. The notification will link directly to My events.",
                  "活动通过审核并发布后，我们会通知你，并可从通知直接打开“我的活动”。",
                  "活動通過審核並發佈後，我們會通知你，並可從通知直接開啟「我的活動」。",
                )}
              </Text>
            </View>
            <View style={styles.approvalSteps}>
              <Text style={styles.approvalStep}>
                ✓{" "}
                {tr(
                  language,
                  "£10 submission payment",
                  "£10提交费",
                  "£10提交費",
                )}
              </Text>
              <Text style={styles.approvalStep}>
                2.{" "}
                {tr(
                  language,
                  "Admin safety review",
                  "管理员安全审核",
                  "管理員安全審核",
                )}
              </Text>
              <Text style={styles.approvalStep}>
                3.{" "}
                {tr(
                  language,
                  "Published to the event forum",
                  "发布到活动论坛",
                  "發佈到活動論壇",
                )}
              </Text>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                close();
                onViewMyEvents();
              }}
            >
              <Text style={styles.primaryButtonText}>
                {tr(language, "View my events", "查看我的活动", "查看我的活動")}
              </Text>
            </Pressable>
          </View>
        ) : paymentMode ? (
          <ScrollView contentContainerStyle={styles.eventPaymentPage}>
            <Pressable style={styles.paymentBack} onPress={() => setPaymentMode(false)}>
              <Ionicons name="arrow-back" size={18} color={palette.blue} />
              <Text style={styles.paymentBackText}>{tr(language, "Back to event details", "返回活动资料", "返回活動資料")}</Text>
            </Pressable>
            <View style={styles.eventPaymentHero}>
              <View style={styles.eventPaymentLock}>
                <Ionicons name="lock-closed" size={22} color={palette.blue} />
              </View>
              <Text style={styles.eventPaymentTitle}>{tr(language, "Secure event submission", "安全提交活动", "安全提交活動")}</Text>
              <Text style={styles.eventPaymentSubtitle}>{tr(language, "Pay the one-off review fee. Your event will remain private until the UNIMATE team approves it.", "支付一次性审核费。活动在UNIMATE团队批准前不会公开。", "支付一次性審核費。活動在UNIMATE團隊批准前不會公開。")}</Text>
            </View>
            <View style={styles.eventPaymentSummary}>
              <View>
                <Text style={styles.eventPaymentSummaryLabel}>{tr(language, "Event review fee", "活动审核费", "活動審核費")}</Text>
                <Text style={styles.eventPaymentSummaryMeta}>{tr(language, "Admin safety and listing review", "管理员安全及发布审核", "管理員安全及發佈審核")}</Text>
              </View>
              <Text style={styles.eventPaymentAmount}>£10.00</Text>
            </View>
            <Text style={styles.formSectionTitle}>{tr(language, "Choose payment method", "选择付款方式", "選擇付款方式")}</Text>
            <View style={styles.eventPaymentMethods}>
              {([
                { name: "Card" as const, label: tr(language, "Debit or credit card", "银行卡", "銀行卡"), icon: "card-outline" },
                { name: "Apple Pay" as const, label: "Apple Pay", icon: "logo-apple" },
                { name: "WeChat Pay" as const, label: tr(language, "WeChat Pay", "微信支付", "微信支付"), icon: "chatbubble-ellipses-outline" },
              ]).map((method) => (
                <Pressable key={method.name} style={[styles.eventPaymentMethod, paymentMethod === method.name && styles.eventPaymentMethodActive]} onPress={() => setPaymentMethod(method.name)}>
                  <View style={styles.eventPaymentMethodIcon}><Ionicons name={method.icon as any} size={21} color={paymentMethod === method.name ? palette.blue : palette.muted} /></View>
                  <Text style={[styles.eventPaymentMethodText, paymentMethod === method.name && styles.eventPaymentMethodTextActive]}>{method.label}</Text>
                  <Ionicons name={paymentMethod === method.name ? "radio-button-on" : "radio-button-off"} size={20} color={paymentMethod === method.name ? palette.blue : "#AAB7C7"} />
                </Pressable>
              ))}
            </View>
            {paymentMethod === "Card" && (
              <View style={styles.eventCardPaymentForm}>
                <Text style={styles.fieldLabel}>{tr(language, "Card number", "卡号", "卡號")}</Text>
                <TextInput style={styles.eventPaymentInput} keyboardType="number-pad" placeholder="1234 5678 9012 3456" placeholderTextColor="#9AA8BB" />
                <View style={styles.eventPaymentInputRow}>
                  <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>{tr(language, "Expiry", "有效期", "有效期")}</Text><TextInput style={styles.eventPaymentInput} placeholder="MM / YY" placeholderTextColor="#9AA8BB" /></View>
                  <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>CVC</Text><TextInput style={styles.eventPaymentInput} keyboardType="number-pad" placeholder="123" placeholderTextColor="#9AA8BB" secureTextEntry /></View>
                </View>
                <Text style={styles.fieldLabel}>{tr(language, "Name on card", "持卡人姓名", "持卡人姓名")}</Text>
                <TextInput style={styles.eventPaymentInput} placeholder={tr(language, "Full name", "姓名", "姓名")} placeholderTextColor="#9AA8BB" />
              </View>
            )}
            <View style={styles.eventPaymentSecure}><Ionicons name="shield-checkmark" size={19} color={palette.green} /><Text style={styles.eventPaymentSecureText}>{tr(language, "Encrypted payment · Your card details are never stored by UNIMATE.", "加密付款 · UNIMATE不会储存你的银行卡资料。", "加密付款 · UNIMATE不會儲存你的銀行卡資料。")}</Text></View>
            <Pressable style={styles.primaryButton} onPress={() => setSubmitted(true)}>
              <Ionicons name="lock-closed" size={16} color="white" />
              <Text style={styles.primaryButtonText}>{tr(language, "Pay £10.00 and submit", "支付£10.00并提交", "支付£10.00並提交")}</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.modalBody}>
            <View style={styles.notice}>
              <Ionicons
                name="shield-checkmark"
                size={22}
                color={palette.blue}
              />
              <Text style={styles.noticeText}>
                {tr(
                  language,
                  "£10 submission fee. Every event is verified by the UNIMATE admin team before it appears publicly.",
                  "提交费为£10。每项活动公开前都由 UNIMATE 管理团队审核。",
                  "提交費為£10。每項活動公開前都由 UNIMATE 管理團隊審核。",
                )}
              </Text>
            </View>
            <Text style={styles.formSectionLabel}>
              {tr(language, "EVENT CATEGORY", "活动分类", "活動分類")}
            </Text>
            <View style={styles.eventCategoryRail}>
              <Pressable
                accessibilityLabel={tr(language, "Previous categories", "上一组分类", "上一組分類")}
                style={styles.eventCategoryArrow}
                onPress={() => categoryScrollRef.current?.scrollTo({ x: 0, animated: true })}
              >
                <Ionicons name="chevron-back" size={18} color={palette.blue} />
              </Pressable>
              <ScrollView
                ref={categoryScrollRef}
                horizontal
                nestedScrollEnabled
                directionalLockEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.eventCategoryScroller}
                contentContainerStyle={styles.categoryRow}
              >
                {categories.map((item) => (
                  <Pressable
                    key={item}
                    style={[
                      styles.categoryChip,
                      category === item && styles.categoryChipActive,
                    ]}
                    onPress={() => setCategory(item)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        category === item && styles.categoryChipTextActive,
                      ]}
                    >
                      {categoryLabel(language, item)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                accessibilityLabel={tr(language, "More categories", "更多分类", "更多分類")}
                style={styles.eventCategoryArrow}
                onPress={() => categoryScrollRef.current?.scrollToEnd({ animated: true })}
              >
                <Ionicons name="chevron-forward" size={18} color={palette.blue} />
              </Pressable>
            </View>
            <View style={styles.photoPicker}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photoPreview} />
              ) : (
                <>
                  <View style={styles.photoIcon}>
                    <Ionicons
                      name="image-outline"
                      size={27}
                      color={palette.blue}
                    />
                  </View>
                  <Text style={styles.photoTitle}>
                    {tr(
                      language,
                      "Add event cover photo",
                      "添加活动封面照片",
                      "加入活動封面相片",
                    )}
                  </Text>
                  <Text style={styles.photoHint}>
                    {tr(
                      language,
                      "Recommended 16:9 · JPG or PNG",
                      "建议比例16:9 · JPG或PNG",
                      "建議比例16:9 · JPG或PNG",
                    )}
                  </Text>
                </>
              )}
            </View>
            <PhotoSourceActions
              language={language}
              onCamera={() => pickPhoto("camera")}
              onLibrary={() => pickPhoto("library")}
            />
            {fields.map((field, index) =>
              index === 1 ? (
                <EventDateField key={field} language={language} value={eventDate} onChange={setEventDate} />
              ) : index === 2 ? (
                <EventTimeField key={field} label={field} value={startTime} onChange={setStartTime} />
              ) : index === 3 ? (
                <EventTimeField key={field} label={field} value={endTime} onChange={setEndTime} />
              ) : index === 7 ? (
                <EventTimeField key={field} label={field} value={lastEntryTime} onChange={setLastEntryTime} />
              ) : (
                <View
                  key={field}
                  style={[styles.field, index === 5 && { minHeight: 100 }]}
                >
                  <Text style={styles.fieldLabel}>{field}</Text>
                  {index === 6 ? (
                  <View style={styles.currencyInputRow}>
                    <Text style={styles.currencyPrefix}>£</Text>
                    <TextInput
                      value={ticketPrice}
                      onChangeText={setTicketPrice}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#A1ADBE"
                      style={styles.currencyInput}
                    />
                  </View>
                  ) : (
                  <TextInput
                    placeholder={tr(
                      language,
                      `Enter ${field.toLowerCase()}`,
                      `请输入${field}`,
                      `請輸入${field}`,
                    )}
                    placeholderTextColor="#A1ADBE"
                    multiline={index === 5}
                  />
                  )}
                </View>
              ),
            )}
            <View style={styles.eventCapacityField}>
              <View style={styles.eventCapacityHead}>
                <View style={styles.eventCapacityIcon}>
                  <Ionicons name="people-outline" size={20} color={palette.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>
                    {tr(language, "Event capacity", "活动人数上限", "活動人數上限")}
                  </Text>
                  <Text style={styles.eventCapacityHint}>
                    {tr(
                      language,
                      "Student events can host up to 50 people.",
                      "学生个人活动最多可容纳50人。",
                      "學生個人活動最多可容納50人。",
                    )}
                  </Text>
                </View>
              </View>
              <View style={styles.eventCapacityControl}>
                <Pressable
                  accessibilityLabel={tr(language, "Reduce capacity", "减少人数", "減少人數")}
                  style={styles.eventCapacityButton}
                  onPress={() => setEventCapacity((value) => Math.max(1, value - 1))}
                >
                  <Ionicons name="remove" size={20} color={palette.blue} />
                </Pressable>
                <View style={styles.eventCapacityValueWrap}>
                  <Text style={styles.eventCapacityValue}>{eventCapacity}</Text>
                  <Text style={styles.eventCapacityUnit}>
                    {tr(language, "spots", "个名额", "個名額")}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={tr(language, "Increase capacity", "增加人数", "增加人數")}
                  style={styles.eventCapacityButton}
                  onPress={() => setEventCapacity((value) => Math.min(50, value + 1))}
                >
                  <Ionicons name="add" size={20} color={palette.blue} />
                </Pressable>
              </View>
              <View style={styles.eventCapacityPresets}>
                {[10, 20, 30, 50].map((value) => (
                  <Pressable
                    key={value}
                    style={[
                      styles.eventCapacityPreset,
                      eventCapacity === value && styles.eventCapacityPresetActive,
                    ]}
                    onPress={() => setEventCapacity(value)}
                  >
                    <Text
                      style={[
                        styles.eventCapacityPresetText,
                        eventCapacity === value && styles.eventCapacityPresetTextActive,
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.eventCapacityPolicy}>
                <Ionicons name="business-outline" size={16} color={palette.blue} />
                <Text style={styles.eventCapacityPolicyText}>
                  {tr(
                    language,
                    "Verified clubs and societies can request capacities up to 200 through their organiser account.",
                    "已认证的俱乐部和学生社团可通过主办方账户申请最多200人的容量。",
                    "已認證的俱樂部及學生社團可透過主辦方帳戶申請最多200人的容量。",
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.organiserIdentity}>
              <View style={styles.organiserAvatar}>
                <Text style={styles.organiserInitial}>S</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.organiserLabel}>
                  {tr(
                    language,
                    "EVENT ORGANISER · ADDED AUTOMATICALLY",
                    "活动主办人 · 自动添加",
                    "活動主辦人 · 自動加入",
                  )}
                </Text>
                <Text style={styles.organiserName}>@studybuddy_uk</Text>
                <Text style={styles.organiserPrivacy}>
                  {tr(
                    language,
                    "Students see your profile photo, username and university. Full profile details stay private unless you become friends.",
                    "其他学生可看到你的头像、用户名和大学。在成为好友前，完整资料保持私密。",
                    "其他學生可看到你的頭像、用戶名稱及大學。在成為好友前，完整資料保持私密。",
                  )}
                </Text>
              </View>
              <Ionicons name="lock-closed" size={17} color={palette.green} />
            </View>
            <View style={styles.staffEventNote}>
              <Ionicons
                name="shield-checkmark"
                size={18}
                color={palette.blue}
              />
              <Text style={styles.staffEventNoteText}>
                {tr(
                  language,
                  "All events are 18+. UNIMATE and official club events are created by approved UNIMATE staff, not through this student form.",
                  "所有活动均限年18岁以上。UNIMATE和官方社团活动由已认证的UNIMATE员工发布，不使用此学生表单。",
                  "所有活動均限年18歲以上。UNIMATE及官方社團活動由已認證的UNIMATE員工發佈，不使用此學生表單。",
                )}
              </Text>
            </View>
            <View style={styles.mapHint}>
              <Ionicons name="map-outline" size={20} color={palette.blue} />
              <Text style={styles.noticeText}>
                {tr(
                  language,
                  "The event page will include an Open Map button for Apple Maps and Google Maps.",
                  "活动页面将提供“打开地图”按钮，可使用 Apple 地图或 Google 地图。",
                  "活動頁面將提供「開啟地圖」按鈕，可使用 Apple 地圖或 Google 地圖。",
                )}
              </Text>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() => setPaymentMode(true)}
            >
              <Text style={styles.primaryButtonText}>
                {tr(
                  language,
                  "Review and pay",
                  "检查并付款",
                  "檢查並付款",
                )}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function AppContent({
  darkMode,
  onToggleDarkMode,
}: {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [eventView, setEventView] = useState<"browse" | "mine">("browse");
  const [language, setLanguage] = useState<Language>("EN");
  const [eventModal, setEventModal] = useState(false);
  const [service, setService] = useState<
    "airport" | "cleaning" | "moving" | "market" | null
  >(null);
  const [sell, setSell] = useState(false);
  const [location, setLocation] = useState("London");
  const [locationOpen, setLocationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [ticketPassOpen, setTicketPassOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(6);
  const [messageDeepLink, setMessageDeepLink] = useState<
    "support" | "lost" | "group" | null
  >(null);
  const [eventDeepLink, setEventDeepLink] = useState<string | null>(null);
  const [eventAnnouncements, setEventAnnouncements] = useState<string[]>([]);
  const [favourites, setFavourites] = useState<string[]>([]);
  const toggleFavourite = (eventTitle: string) =>
    setFavourites((current) =>
      current.includes(eventTitle)
        ? current.filter((item) => item !== eventTitle)
        : [...current, eventTitle],
    );
  const content = useMemo(
    () =>
      tab === "home" ? (
        <Home
          language={language}
          setTab={setTab}
          openService={setService}
          openFriends={() => setTab("friends")}
          openEvent={(eventTitle) => { setEventDeepLink(eventTitle); setTab("events"); }}
          favourites={favourites}
          onToggleFavourite={toggleFavourite}
        />
      ) : tab === "events" ? (
        <EventsForum
          key={eventView}
          language={language}
          initialEvent={eventDeepLink}
          view={eventView}
          onViewChange={setEventView}
          onPost={() => setEventModal(true)}
          favourites={favourites}
          onToggleFavourite={toggleFavourite}
          onOpenGroupChat={() => {
            setMessageDeepLink("group");
            setTab("messages");
          }}
          onPublishAnnouncement={(announcement) =>
            setEventAnnouncements((current) => [announcement, ...current])
          }
        />
      ) : tab === "food" ? (
        <FoodForum language={language} />
      ) : tab === "friends" ? (
        <FriendsHub language={language} />
      ) : tab === "bookings" ? (
        <BookingsPage
          language={language}
          onOpenEvent={(eventTitle) => {
            setEventDeepLink(eventTitle);
            setTab("events");
          }}
          onOpenMessages={(thread) => {
            setMessageDeepLink(thread);
            setTab("messages");
          }}
        />
      ) : tab === "messages" ? (
        <MessagesPage
          language={language}
          initialThread={messageDeepLink}
          onClearInitialThread={() => setMessageDeepLink(null)}
          eventAnnouncements={eventAnnouncements}
        />
      ) : (
        <Profile
          language={language}
          onLanguage={setLanguage}
          onNavigate={(nextTab) => {
            if (nextTab === "events") setEventView("mine");
            setTab(nextTab);
          }}
          darkMode={darkMode}
          onToggleDarkMode={onToggleDarkMode}
        />
      ),
    [tab, language, eventDeepLink, favourites, messageDeepLink, darkMode, eventView, eventAnnouncements],
  );
  const tabs = [
    { id: "home" as const, icon: "home", label: words[language].home },
    { id: "friends" as const, icon: "people", label: words[language].friends },
    {
      id: "bookings" as const,
      icon: "receipt",
      label: words[language].bookings,
    },
    {
      id: "messages" as const,
      icon: "chatbubbles",
      label: words[language].messages,
    },
    { id: "profile" as const, icon: "person", label: words[language].profile },
  ];
  const themeProps =
    Platform.OS === "web"
      ? ({ className: darkMode ? "unimate-dark" : "unimate-light" } as any)
      : {};
  return (
    <>
      {Platform.OS === "web" &&
        React.createElement("style", {
          dangerouslySetInnerHTML: { __html: darkThemeCss },
        })}
      <SafeAreaView
        {...themeProps}
        style={[styles.safe, darkMode && styles.darkSafe]}
      >
        <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} />
        <Header
          darkMode={darkMode}
          onToggleTheme={onToggleDarkMode}
          language={language}
          onLanguage={setLanguage}
          location={location}
          onHome={() => {
            setEventDeepLink(null);
            setTab("home");
          }}
          onLocation={() => setLocationOpen(true)}
          onNotifications={() => {
            setUnreadCount(0);
            setNotificationsOpen(true);
          }}
          unreadCount={unreadCount}
        />
        <View style={[styles.content, darkMode && styles.darkContent]}>
          {content}
        </View>
        <View style={[styles.tabBar, darkMode && styles.darkTabBar]}>
          {tabs.map((item) => (
            <Pressable
              key={item.id}
              style={styles.tab}
              onPress={() => {
                setEventDeepLink(null);
                if (item.id === "home") setEventView("browse");
                setTab(item.id);
              }}
            >
              <Ionicons
                name={
                  (tab === item.id ? item.icon : `${item.icon}-outline`) as any
                }
                size={22}
                color={tab === item.id ? palette.blue : palette.muted}
              />
              <Text
                style={[
                  styles.tabText,
                  tab === item.id && styles.tabTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <EventModal
          visible={eventModal}
          onClose={() => setEventModal(false)}
          onViewMyEvents={() => {
            setEventView("mine");
            setTab("events");
          }}
          language={language}
        />
        <LocationPicker
          visible={locationOpen}
          language={language}
          onClose={() => setLocationOpen(false)}
          onSelect={setLocation}
        />
        <Sheet
          visible={notificationsOpen}
          title={tr(language, "Notifications", "通知", "通知")}
          onClose={() => setNotificationsOpen(false)}
        >
          <NotificationCenter
            language={language}
            favourites={favourites}
            onViewTicket={() => {
              setNotificationsOpen(false);
              setTicketPassOpen(true);
            }}
            onViewEvent={(eventTitle) => {
              setNotificationsOpen(false);
              setEventDeepLink(eventTitle);
              setTab("events");
            }}
            onViewMyEvents={() => {
              setNotificationsOpen(false);
              setEventDeepLink(null);
              setEventView("mine");
              setTab("events");
            }}
          />
        </Sheet>
        <TicketPass
          visible={ticketPassOpen}
          language={language}
          onClose={() => setTicketPassOpen(false)}
        />
        <Sheet
          visible={service !== null}
          title={
            service === "market" ? words[language].market : words[language].book
          }
          onClose={() => setService(null)}
        >
          {service === "market" ? (
            <Marketplace language={language} onSell={() => setSell(true)} />
          ) : service ? (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <ServiceForm
                type={
                  service === "airport"
                    ? "Airport transfer"
                    : service === "moving"
                      ? "Moving"
                      : "Cleaning"
                }
                language={language}
              />
            </ScrollView>
          ) : null}
        </Sheet>
        <SellItemForm
          visible={sell}
          language={language}
          onClose={() => setSell(false)}
        />
      </SafeAreaView>
    </>
  );
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  return (
    <DarkModeContext.Provider value={darkMode}>
      <SafeAreaProvider>
        <KeyboardAvoidingView
          style={[styles.appFrame, darkMode && styles.darkAppFrame]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <AppContent
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((current) => !current)}
          />
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </DarkModeContext.Provider>
  );
}

const styles = StyleSheet.create({
  appFrame: { flex: 1, backgroundColor: "#F4F7FB" },
  darkAppFrame: { backgroundColor: "#0B1423" },
  safe: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: palette.white,
  },
  content: { flex: 1, minHeight: 0 },
  scroll: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32 },
  header: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    zIndex: 30,
  },
  brandLogoFrame: { width: 150, height: 56, position: "relative" },
  brandLogo: { width: 150, height: 56 },
  brandLogoMarkClip: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 49,
    height: 56,
    overflow: "hidden",
  },
  brandLogoMark: { width: 150, height: 56 },
  headerControls: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F7FC",
    borderWidth: 1,
    borderColor: "#DCE8F3",
  },
  languageIconButton: {
    height: 38,
    minWidth: 72,
    borderRadius: 19,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: palette.sky,
    borderWidth: 1,
    borderColor: "#CDE4F8",
  },
  languageCompact: { color: palette.blue, fontWeight: "900", fontSize: 10 },
  notificationBadge: {
    position: "absolute",
    right: -3,
    top: -4,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.coral,
    borderWidth: 2,
    borderColor: "white",
  },
  notificationBadgeText: { color: "white", fontSize: 8, fontWeight: "900" },
  languageMenu: {
    position: "absolute",
    top: 67,
    right: 18,
    width: 190,
    backgroundColor: "white",
    borderRadius: 15,
    padding: 6,
    shadowColor: "#102A4C",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 12,
    borderWidth: 1,
    borderColor: palette.line,
    zIndex: 100,
  },
  languageOption: {
    minHeight: 45,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 11,
  },
  languageOptionActive: { backgroundColor: palette.sky },
  languageCode: {
    color: palette.blue,
    fontSize: 10,
    fontWeight: "900",
    width: 26,
  },
  languageName: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  languageNameActive: { color: palette.navy, fontWeight: "900" },
  headerCompact: { minHeight: 66, paddingHorizontal: 10 },
  brandLogoFrameCompact: { width: 108, height: 45 },
  brandLogoCompact: { width: 108, height: 45 },
  brandLogoMarkClipCompact: { width: 35, height: 45 },
  brandLogoMarkCompact: { width: 108, height: 45 },
  headerControlsCompact: { gap: 5 },
  headerIconButtonCompact: { width: 34, height: 34, borderRadius: 17 },
  languageIconButtonCompact: {
    minWidth: 62,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 7,
  },
  homeGreetingRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  homeEyebrow: {
    color: palette.blue,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  welcome: {
    fontSize: 24,
    fontWeight: "900",
    color: palette.navy,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 3,
    marginBottom: 14,
  },
  studentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECF9F2",
    borderRadius: 15,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginTop: 4,
  },
  studentBadgeText: { color: "#28754C", fontSize: 8, fontWeight: "900" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F6FB",
    borderRadius: 14,
    paddingHorizontal: 13,
    height: 46,
    marginBottom: 16,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: palette.ink },
  hero: {
    minHeight: 190,
    borderRadius: 22,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 14,
  },
  heroCopy: { flex: 1, zIndex: 2 },
  heroKicker: {
    color: "#BFE7FF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: "white",
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900",
    marginVertical: 6,
  },
  heroText: {
    color: "white",
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.9,
    maxWidth: 265,
  },
  heroButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: "white",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 13,
  },
  heroButtonText: { color: palette.blue, fontSize: 9, fontWeight: "900" },
  heroArt: { position: "absolute", right: -7, bottom: 0 },
  homeStatusRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  homeStatusCard: {
    flex: 1,
    minHeight: 84,
    borderWidth: 1,
    borderColor: "#DCE5EF",
    borderRadius: 15,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "white",
  },
  homeStatusIcon: {
    width: 35,
    height: 35,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  homeStatusLabel: { color: palette.muted, fontSize: 8, fontWeight: "800" },
  homeStatusValue: {
    color: palette.navy,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "900",
    marginTop: 3,
  },
  serviceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
    marginBottom: 9,
  },
  service: {
    width: "50%",
    padding: 5,
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#E1E8F0",
    borderRadius: 16,
    backgroundColor: "white",
    transform: [{ scale: 0.97 }],
  },
  serviceNarrow: { width: "100%" },
  serviceIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  serviceLabel: {
    color: palette.navy,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  serviceHint: {
    color: palette.muted,
    fontSize: 8,
    lineHeight: 11,
    marginTop: 3,
  },
  serviceZh: { color: palette.muted, fontSize: 10, marginTop: 1 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 19, fontWeight: "900", color: palette.navy },
  seeAll: { color: palette.blue, fontWeight: "700" },
  eventCard: {
    backgroundColor: "white",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#30517A",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  eventImage: { height: 132, width: "100%" },
  eventTag: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#6D3EEB",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  eventTagText: { color: "white", fontSize: 10, fontWeight: "800" },
  heart: {
    position: "absolute",
    right: 10,
    top: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4,24,57,.28)",
  },
  heartFavourite: { backgroundColor: palette.coral },
  eventBody: { padding: 14 },
  eventRecommendation: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.sky,
    borderRadius: 11,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 9,
  },
  eventRecommendationText: {
    color: palette.blue,
    fontSize: 8,
    fontWeight: "800",
  },
  eventReleaseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#F7FAFD",
    borderWidth: 1,
    borderColor: "#DEE8F1",
    padding: 10,
    marginTop: 11,
  },
  eventReleaseTitle: { color: palette.navy, fontSize: 9, fontWeight: "900" },
  eventReleaseText: { color: palette.muted, fontSize: 8, marginTop: 2 },
  eventReleaseReminder: { color: "#9A680D", fontSize: 8, fontWeight: "900" },
  eventTitleLine: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  eventTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "900",
    color: palette.navy,
    marginBottom: 7,
  },
  categoryBadge: {
    backgroundColor: palette.sky,
    color: palette.blue,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 9,
    fontWeight: "900",
  },
  meta: { flexDirection: "row", alignItems: "center", marginTop: 3 },
  metaText: { marginLeft: 6, fontSize: 12, color: palette.muted },
  people: {
    marginLeft: "auto",
    color: palette.blue,
    fontSize: 11,
    fontWeight: "800",
  },
  price: { fontWeight: "900", color: palette.ink, fontSize: 15 },
  eventFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
    marginHorizontal: -4,
  },
  eventFact: {
    width: "50%",
    minHeight: 44,
    paddingHorizontal: 4,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  eventFactLabel: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  eventFactValue: {
    color: palette.ink,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  eventFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 11,
    marginTop: 5,
  },
  eventCapacity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.sky,
    borderRadius: 13,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  eventCapacitySoldOut: { backgroundColor: "#FFF0F1" },
  eventCapacityText: { color: palette.blue, fontSize: 10, fontWeight: "900" },
  eventCapacityTextSoldOut: { color: palette.coral },
  categoryScroller: { marginHorizontal: -18, marginBottom: 15 },
  categoryRow: { gap: 8, paddingHorizontal: 18 },
  categoryChip: {
    borderWidth: 1,
    borderColor: "#D8E2EE",
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: "white",
  },
  categoryChipActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  categoryChipText: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  categoryChipTextActive: { color: "white" },
  noEvents: { alignItems: "center", paddingVertical: 55 },
  eventDetail: { padding: 18, paddingBottom: 38 },
  detailImage: {
    width: "100%",
    height: 230,
    borderRadius: 20,
    backgroundColor: "#EEF2F6",
  },
  detailCategory: {
    alignSelf: "flex-start",
    backgroundColor: "#6D3EEB",
    borderRadius: 9,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: -15,
    marginLeft: 12,
  },
  detailTitleRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  detailTitle: {
    flex: 1,
    color: palette.navy,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
  },
  shareButton: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  detailSummary: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  detailGrid: {
    backgroundColor: "#F7F9FC",
    borderRadius: 17,
    padding: 14,
    marginTop: 16,
    gap: 13,
  },
  detailReleaseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#CFE2F5",
    backgroundColor: palette.sky,
    padding: 12,
    marginTop: 12,
  },
  detailReleaseIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  detailReleaseTitle: { color: palette.navy, fontSize: 10, fontWeight: "900" },
  detailReleaseText: { color: palette.muted, fontSize: 9, marginTop: 3 },
  detailReminderButton: { minHeight: 34, borderRadius: 10, backgroundColor: palette.blue, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  detailReminderText: { color: "white", fontSize: 8, fontWeight: "900" },
  detailItem: { flexDirection: "row", alignItems: "center", gap: 11 },
  detailLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  detailValue: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  locationCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
  },
  mapButton: {
    backgroundColor: palette.blue,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  mapButtonText: { color: "white", fontWeight: "900", fontSize: 10 },
  verifiedNotice: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    marginTop: 13,
  },
  verifiedText: { color: "#197341", fontWeight: "800", fontSize: 11 },
  organiserCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 16,
    padding: 12,
    marginTop: 15,
  },
  organiserLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  organiserInitial: { color: "white", fontWeight: "900", fontSize: 20 },
  organiserRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 6,
    marginTop: 3,
  },
  organiserRatingText: { color: "#8A5B00", fontSize: 9, fontWeight: "800" },
  followOrganiser: {
    backgroundColor: palette.sky,
    borderRadius: 13,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  followOrganiserText: { color: palette.blue, fontWeight: "900", fontSize: 10 },
  segment: {
    width: "100%",
    flexDirection: "row",
    backgroundColor: "#EDF3FA",
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  segmentItem: {
    flex: 1,
    minHeight: 39,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    paddingHorizontal: 3,
  },
  segmentActive: { backgroundColor: palette.blue },
  segmentText: { color: palette.muted, fontWeight: "800", fontSize: 11 },
  segmentTextSmall: {
    color: palette.muted,
    fontWeight: "800",
    fontSize: 10,
    textAlign: "center",
  },
  segmentTextActive: { color: "white" },
  chips: { flexDirection: "row", marginBottom: 6 },
  chip: {
    backgroundColor: "#F2F6FB",
    color: palette.muted,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 14,
    fontSize: 11,
    marginRight: 7,
  },
  chipActive: {
    backgroundColor: "#DCEEFF",
    color: palette.blue,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 14,
    fontSize: 11,
    fontWeight: "800",
    marginRight: 7,
  },
  friend: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 27,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { color: palette.navy, fontWeight: "900" },
  friendName: { color: palette.navy, fontWeight: "900", fontSize: 15 },
  friendUni: {
    color: palette.blue,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  friendInterests: { color: palette.muted, fontSize: 11, marginTop: 3 },
  follow: {
    backgroundColor: palette.blue,
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  followText: { color: "white", fontWeight: "800", fontSize: 12 },
  followSent: {
    backgroundColor: palette.sky,
    borderWidth: 1,
    borderColor: "#B6D8F8",
  },
  messageCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  friendsTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 13,
  },
  requestBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  requestBadgeText: {
    position: "absolute",
    right: -2,
    top: -4,
    color: "white",
    backgroundColor: palette.coral,
    fontSize: 9,
    fontWeight: "900",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    textAlign: "center",
    lineHeight: 16,
  },
  requestCard: {
    flexDirection: "row",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  requestActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  acceptButton: {
    backgroundColor: palette.blue,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  acceptText: { color: "white", fontWeight: "900", fontSize: 11 },
  declineButton: {
    backgroundColor: "#F2F5F8",
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  declineText: { color: palette.muted, fontWeight: "900", fontSize: 11 },
  friendProfile: { padding: 18, paddingBottom: 40 },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  backText: { color: palette.blue, fontWeight: "800" },
  friendProfileHero: { alignItems: "center", paddingVertical: 8 },
  largeAvatar: { width: 96, height: 96, borderRadius: 48, marginRight: 0 },
  largeAvatarText: { color: palette.navy, fontWeight: "900", fontSize: 28 },
  friendProfileName: {
    color: palette.navy,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 11,
  },
  privacyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECF9F2",
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
    maxWidth: 350,
  },
  privacyText: {
    color: "#197341",
    fontSize: 10,
    lineHeight: 15,
    flex: 1,
    fontWeight: "700",
  },
  friendSectionTitle: {
    color: palette.navy,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 19,
    marginBottom: 9,
  },
  promptCard: { backgroundColor: "#F7F2FF", borderRadius: 16, padding: 16 },
  prompt: {
    color: "#7542C8",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  answer: {
    color: palette.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
    marginTop: 7,
  },
  interestWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 13,
  },
  interestChip: {
    backgroundColor: palette.sky,
    borderRadius: 15,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  interestText: { color: palette.blue, fontWeight: "800", fontSize: 11 },
  socialRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  socialLocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
  socialName: { color: palette.ink, fontSize: 11, fontWeight: "800" },
  privateNote: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: palette.navy,
    marginBottom: 14,
  },
  actionRow: { marginBottom: 15 },
  createEvent: {
    backgroundColor: palette.coral,
    borderRadius: 14,
    minHeight: 48,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  createText: { color: "white", fontWeight: "900" },
  formCard: {
    borderRadius: 18,
    backgroundColor: "white",
    padding: 16,
    borderWidth: 1,
    borderColor: palette.line,
  },
  formHero: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingBottom: 14,
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  formHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  formTitle: { color: palette.navy, fontSize: 19, fontWeight: "900" },
  formDesc: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  field: {
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 12,
    minHeight: 56,
  },
  fieldLabel: {
    color: palette.navy,
    fontWeight: "800",
    fontSize: 11,
    marginBottom: 5,
  },
  fieldHint: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 5,
  },
  selectWrap: { marginTop: 12 },
  selectField: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "white",
  },
  selectFieldOpen: {
    borderColor: palette.blue,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  selectValue: { flex: 1, color: palette.ink, fontSize: 12, fontWeight: "700" },
  selectMenu: {
    borderWidth: 1,
    borderColor: "#C9D8E8",
    borderTopWidth: 0,
    borderBottomLeftRadius: 11,
    borderBottomRightRadius: 11,
    overflow: "hidden",
    backgroundColor: "white",
  },
  selectMenuScroll: { maxHeight: 220 },
  selectOption: {
    minHeight: 43,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EDF1F5",
  },
  selectOptionActive: { backgroundColor: palette.sky },
  selectOptionText: { flex: 1, color: palette.ink, fontSize: 11 },
  selectOptionTextActive: { color: palette.blue, fontWeight: "900" },
  transferSegment: {
    flexDirection: "row",
    gap: 7,
    backgroundColor: "#EDF3FA",
    borderRadius: 14,
    padding: 4,
    marginTop: 13,
  },
  transferSegmentItem: {
    flex: 1,
    minHeight: 45,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 5,
  },
  transferSegmentActive: { backgroundColor: palette.blue },
  transferSegmentText: {
    color: palette.navy,
    fontSize: 11,
    textAlign: "center",
    fontWeight: "800",
  },
  transferSegmentTextActive: { color: "white" },
  formTwoColumns: { flexDirection: "row", gap: 9 },
  formColumnsCompact: { flexDirection: "column", gap: 0 },
  formHalf: { flex: 1, minWidth: 0 },
  capacityNote: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    padding: 11,
    backgroundColor: palette.sky,
    borderRadius: 12,
    marginTop: 13,
  },
  capacityNoteText: {
    flex: 1,
    color: palette.navy,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "600",
  },
  formSectionTitle: {
    color: palette.navy,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 18,
    marginBottom: 8,
  },
  timeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
  },
  selectedTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: palette.sky,
  },
  selectedTimeText: { color: palette.blue, fontSize: 11, fontWeight: "900" },
  meetingOptions: { gap: 8 },
  meetingOption: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  meetingOptionActive: {
    borderColor: palette.blue,
    backgroundColor: "#F4FAFF",
  },
  meetingOptionText: {
    flex: 1,
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  meetingOptionTextActive: { color: palette.navy, fontWeight: "900" },
  assistanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    marginTop: 10,
  },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#B8C6D6",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  checkboxActive: {
    backgroundColor: palette.green,
    borderColor: palette.green,
  },
  assistanceTitle: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  assistanceText: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2,
  },
  fareCard: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#CFE2F5",
    borderRadius: 17,
    overflow: "hidden",
    backgroundColor: "#FBFDFF",
  },
  fareHead: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  eligiblePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E9F8F0",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginTop: 8,
  },
  eligibleText: { color: "#197341", fontSize: 9, fontWeight: "800" },
  fareLine: {
    minHeight: 39,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
  },
  fareLineLabel: { flex: 1, color: palette.muted, fontSize: 11 },
  fareLineValue: { color: palette.ink, fontWeight: "800", fontSize: 11 },
  fareTotal: {
    minHeight: 54,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.sky,
  },
  fareTotalLabel: {
    flex: 1,
    color: palette.navy,
    fontWeight: "900",
    fontSize: 13,
  },
  fareTotalValue: { color: palette.blue, fontWeight: "900", fontSize: 20 },
  depositRow: {
    minHeight: 67,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.navy,
  },
  depositLabel: { color: "white", fontWeight: "900", fontSize: 12 },
  balanceText: { color: "#B9D3EF", fontSize: 9, marginTop: 4 },
  depositValue: {
    marginLeft: "auto",
    color: "white",
    fontWeight: "900",
    fontSize: 20,
  },
  currencyRow: { flexDirection: "row", gap: 8 },
  currencyButton: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#D5E0EB",
  },
  currencyButtonActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  currencyButtonText: { color: palette.muted, fontWeight: "900", fontSize: 11 },
  currencyButtonTextActive: { color: "white" },
  paymentGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  paymentMethod: {
    width: "50%",
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#D5E0EB",
    borderRadius: 12,
    margin: 0,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    transform: [{ scale: 0.97 }],
  },
  paymentMethodActive: {
    borderColor: palette.blue,
    backgroundColor: "#F2F8FE",
  },
  paymentMethodText: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  paymentMethodTextActive: { color: palette.navy },
  cardFields: { marginTop: 2 },
  secureNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F7FB",
    borderRadius: 12,
    padding: 11,
    marginTop: 13,
  },
  secureNoteText: {
    flex: 1,
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
  },
  primaryButton: {
    backgroundColor: palette.blue,
    minHeight: 51,
    borderRadius: 13,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    paddingHorizontal: 24,
  },
  primaryButtonText: { color: "white", fontWeight: "900", fontSize: 15 },
  empty: {
    flex: 1,
    padding: 35,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    color: palette.navy,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: palette.muted,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 9,
    maxWidth: 320,
  },
  profileTop: { alignItems: "center", paddingVertical: 18 },
  profileAvatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#DCEEFF",
    marginRight: 0,
  },
  profileInitial: { color: palette.blue, fontSize: 31, fontWeight: "900" },
  profileName: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  profileUni: { color: palette.muted, marginTop: 4 },
  linkedIcons: { flexDirection: "row", gap: 5, marginTop: 10 },
  linkedIcon: {
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  profileTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 12,
  },
  profileTag: {
    backgroundColor: palette.sky,
    color: palette.blue,
    marginHorizontal: 3,
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 13,
    fontSize: 11,
    fontWeight: "700",
  },
  profileMenuCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 17,
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  privacySheetBody: { padding: 18, paddingBottom: 44 },
  privacyIntro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#ECF9F2",
    borderRadius: 14,
    padding: 12,
    marginBottom: 13,
  },
  privacyIntroText: { flex: 1, color: "#397653", fontSize: 9, lineHeight: 14 },
  profilePrivacyCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 17,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "white",
  },
  profilePrivacyHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  socialSetting: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  socialEditor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingVertical: 11,
  },
  socialLogo: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  socialEditorName: { color: palette.ink, fontWeight: "900", fontSize: 12 },
  socialInput: {
    color: palette.ink,
    paddingVertical: 4,
    fontSize: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E1EB",
  },
  visibilityButton: {
    width: 38,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E7ECF2",
    alignItems: "center",
    justifyContent: "center",
  },
  visibilityOn: { backgroundColor: palette.blue },
  privateModeText: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  toggle: {
    width: 39,
    height: 23,
    borderRadius: 12,
    padding: 2,
    backgroundColor: "#CAD3DF",
  },
  toggleOn: { backgroundColor: palette.green },
  toggleKnob: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: "white",
  },
  toggleKnobOn: { marginLeft: 16 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 57,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  menuText: { color: palette.ink, fontWeight: "700", flex: 1 },
  tabBar: {
    minHeight: 66,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: "row",
    backgroundColor: "white",
    paddingBottom: Platform.OS === "android" ? 4 : 5,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  tabText: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 12,
    marginTop: 3,
    textAlign: "center",
  },
  tabTextActive: { color: palette.blue, fontWeight: "800" },
  modal: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: "white",
  },
  modalHead: {
    height: 62,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  modalTitle: { color: palette.navy, fontSize: 18, fontWeight: "900" },
  modalBody: { padding: 18, paddingBottom: 40 },
  notice: {
    backgroundColor: palette.sky,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  noticeText: {
    color: palette.navy,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
    fontWeight: "600",
  },
  formSectionLabel: {
    color: palette.muted,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 10,
  },
  photoPicker: {
    minHeight: 178,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#AFCDEB",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    padding: 20,
    overflow: "hidden",
    backgroundColor: "#F7FBFF",
  },
  photoIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  photoTitle: { color: palette.navy, fontWeight: "900", marginTop: 8 },
  photoHint: { color: palette.muted, fontSize: 10, marginTop: 3 },
  photoPreview: { width: "100%", height: 180 },
  eventCategoryRail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 2,
  },
  eventCategoryScroller: { flex: 1 },
  eventCategoryArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.sky,
    borderWidth: 1,
    borderColor: "#CFE3F8",
  },
  photoSourceActions: {
    width: "100%",
    flexDirection: "row",
    gap: 9,
    marginTop: 10,
  },
  photoSourceActionsCompact: {
    flexDirection: "column",
    gap: 6,
    paddingHorizontal: 8,
  },
  photoSourceButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#BFD8F0",
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  photoSourceButtonCompact: {
    flex: 0,
    width: "100%",
    minHeight: 34,
    borderRadius: 10,
  },
  photoSourceText: { color: palette.blue, fontSize: 10, fontWeight: "900" },
  currencyInputRow: { flexDirection: "row", alignItems: "center", minHeight: 25 },
  currencyPrefix: { color: palette.navy, fontSize: 18, fontWeight: "900", marginRight: 5 },
  currencyInput: { flex: 1, color: palette.ink, fontSize: 15, paddingVertical: 2 },
  eventPaymentPage: { padding: 20, paddingBottom: 44 },
  paymentBack: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 18 },
  paymentBackText: { color: palette.blue, fontSize: 11, fontWeight: "900" },
  eventPaymentHero: { alignItems: "center", marginBottom: 18 },
  eventPaymentLock: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.sky, alignItems: "center", justifyContent: "center" },
  eventPaymentTitle: { color: palette.navy, fontSize: 22, fontWeight: "900", marginTop: 11 },
  eventPaymentSubtitle: { maxWidth: 390, color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 6 },
  eventPaymentSummary: { borderRadius: 15, borderWidth: 1, borderColor: "#D8E5F1", backgroundColor: "#F8FBFF", padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eventPaymentSummaryLabel: { color: palette.navy, fontSize: 13, fontWeight: "900" },
  eventPaymentSummaryMeta: { color: palette.muted, fontSize: 9, marginTop: 3 },
  eventPaymentAmount: { color: palette.navy, fontSize: 20, fontWeight: "900" },
  eventPaymentMethods: { gap: 8, marginTop: 9 },
  eventPaymentMethod: { minHeight: 56, borderWidth: 1, borderColor: "#D6E1ED", borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "white" },
  eventPaymentMethodActive: { borderColor: palette.blue, backgroundColor: "#F3F9FF" },
  eventPaymentMethodIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.sky, alignItems: "center", justifyContent: "center" },
  eventPaymentMethodText: { flex: 1, color: palette.muted, fontSize: 12, fontWeight: "800" },
  eventPaymentMethodTextActive: { color: palette.navy, fontWeight: "900" },
  eventCardPaymentForm: { marginTop: 13, borderRadius: 15, borderWidth: 1, borderColor: "#D8E5F1", padding: 13, gap: 7 },
  eventPaymentInput: { minHeight: 46, borderWidth: 1, borderColor: "#D6E1ED", borderRadius: 11, paddingHorizontal: 12, color: palette.ink, marginTop: 5 },
  eventPaymentInputRow: { flexDirection: "row", gap: 10 },
  eventPaymentSecure: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 13, backgroundColor: "#ECF9F2", marginTop: 14 },
  eventPaymentSecureText: { flex: 1, color: "#347253", fontSize: 9, lineHeight: 14 },
  organiserIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#CFE3F8",
    borderRadius: 15,
    padding: 12,
    marginTop: 13,
    backgroundColor: "#F8FBFF",
  },
  organiserAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  organiserLabel: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  organiserName: {
    color: palette.navy,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
  },
  organiserPrivacy: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
  },
  staffEventNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    backgroundColor: palette.sky,
    padding: 11,
    marginTop: 10,
  },
  staffEventNoteText: {
    flex: 1,
    color: palette.navy,
    fontSize: 9,
    lineHeight: 14,
  },
  mapHint: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: "#F2F7FC",
    borderRadius: 12,
    padding: 12,
    marginTop: 13,
  },
  approvalSteps: {
    alignSelf: "stretch",
    backgroundColor: "#F6F9FC",
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
    gap: 9,
  },
  approvalStep: { color: palette.ink, fontWeight: "700", fontSize: 12 },
  ticketBody: { padding: 18, paddingBottom: 120, backgroundColor: "#F4F6F8" },
  ticketEvent: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 12,
    backgroundColor: "white",
    borderRadius: 15,
    marginBottom: 14,
  },
  ticketThumb: { width: 105, height: 68, borderRadius: 10 },
  ticketTier: {
    backgroundColor: "white",
    borderRadius: 15,
    marginBottom: 13,
    overflow: "hidden",
  },
  ticketTierTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  ticketTierName: { color: palette.ink, fontWeight: "900", fontSize: 16 },
  ticketTierPrice: {
    color: palette.ink,
    fontWeight: "900",
    fontSize: 16,
    textAlign: "right",
  },
  ticketFee: { color: palette.muted, fontSize: 10, marginTop: 3 },
  quantityRow: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    padding: 13,
    justifyContent: "flex-end",
  },
  quantityButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#D7DEE7",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityActive: { backgroundColor: palette.navy, borderColor: palette.navy },
  quantityText: { color: palette.muted, fontWeight: "800" },
  quantityTextActive: { color: "white" },
  checkoutBar: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
  },
  checkoutTotal: {
    color: palette.navy,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },
  checkoutButton: {
    backgroundColor: palette.navy,
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 30,
  },
  checkoutButtonText: { color: "white", fontWeight: "900" },
  reviewButton: {
    backgroundColor: palette.coral,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 14,
  },
  reviewButtonText: { color: "white", fontSize: 11, fontWeight: "900" },
  foodModeRow: { gap: 7, paddingVertical: 13 },
  foodMode: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#CFE0F1",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "white",
  },
  foodModeActive: { backgroundColor: palette.blue, borderColor: palette.blue },
  foodModeText: { color: palette.blue, fontSize: 10, fontWeight: "900" },
  foodModeTextActive: { color: "white" },
  foodFilterRow: { gap: 7, paddingRight: 12 },
  foodSectionHint: { color: palette.muted, fontSize: 9, marginTop: 3 },
  featuredListRow: { gap: 11, paddingBottom: 18 },
  featuredListCard: {
    width: 214,
    height: 145,
    borderRadius: 17,
    overflow: "hidden",
    backgroundColor: "#EAF0F6",
  },
  featuredListImage: { width: "100%", height: "100%" },
  featuredListShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 13,
    paddingTop: 45,
  },
  featuredListTitle: { color: "white", fontSize: 15, fontWeight: "900" },
  featuredListMeta: { color: "#DCE9F7", fontSize: 9, marginTop: 4 },
  foodCard: {
    backgroundColor: "white",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 17,
    borderWidth: 1,
    borderColor: palette.line,
  },
  foodImage: { width: "100%", height: 160 },
  rating: {
    position: "absolute",
    top: 12,
    left: 12,
    minWidth: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.green,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "white",
    paddingHorizontal: 8,
  },
  ratingText: { color: "white", fontWeight: "900", fontSize: 13 },
  foodBookmark: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  foodBody: { padding: 14 },
  foodTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  reviewCount: { color: palette.blue, fontSize: 10, fontWeight: "800" },
  dish: { color: palette.ink, fontWeight: "800", marginTop: 10 },
  quote: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  friendPickLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    marginTop: 12,
    paddingTop: 11,
  },
  friendFaceStack: { flexDirection: "row", width: 42 },
  miniFace: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  miniFaceOverlap: { marginLeft: -8 },
  miniFaceText: { color: palette.navy, fontSize: 7, fontWeight: "900" },
  friendPickText: {
    flex: 1,
    color: palette.blue,
    fontSize: 9,
    fontWeight: "800",
  },
  foodDetailBody: { padding: 18, paddingBottom: 46 },
  foodDetailHero: {
    width: "100%",
    height: 215,
    borderRadius: 20,
    backgroundColor: "#EEF2F6",
  },
  foodDetailBookmark: {
    position: "absolute",
    right: 13,
    bottom: 13,
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#173A65",
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  foodDetailTitle: {
    color: palette.navy,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 15,
  },
  foodDetailMeta: { color: palette.muted, fontSize: 11, marginTop: 5 },
  placeActions: { flexDirection: "row", gap: 7, marginTop: 15 },
  placeAction: {
    flex: 1,
    minHeight: 43,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#BFD7ED",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  placeActionText: { color: palette.blue, fontSize: 9, fontWeight: "900" },
  scoreGrid: { flexDirection: "row", gap: 8, marginTop: 16 },
  scoreCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 14,
    backgroundColor: "#F4F8FC",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  scoreValue: {
    color: palette.navy,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 3,
  },
  scoreLabel: {
    color: palette.muted,
    fontSize: 8,
    textAlign: "center",
    marginTop: 2,
  },
  foodPhotoRow: { gap: 8, paddingBottom: 4 },
  foodDetailPhoto: {
    width: 142,
    height: 112,
    borderRadius: 13,
    backgroundColor: "#EEF2F6",
  },
  menuPhotoCard: {
    width: 142,
    height: 112,
    borderRadius: 13,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#AFCDEB",
    backgroundColor: "#F7FBFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  menuPhotoText: {
    color: palette.blue,
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 6,
  },
  studentReviewCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 16,
    padding: 13,
    marginTop: 17,
  },
  studentReviewHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  reviewStars: { color: "#F2A91B", fontSize: 11, letterSpacing: 1 },
  translateButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.sky,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  translateText: { color: palette.blue, fontSize: 9, fontWeight: "900" },
  friendOpinion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F6F9FC",
    borderRadius: 14,
    padding: 12,
  },
  foodReviewBody: { padding: 18, paddingBottom: 48 },
  reviewPlaceHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#F4F8FC",
    borderRadius: 15,
    padding: 10,
  },
  reviewPlaceImage: { width: 62, height: 62, borderRadius: 12 },
  sentimentRow: { flexDirection: "row", gap: 7 },
  sentimentOption: {
    flex: 1,
    minHeight: 84,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 7,
    borderWidth: 2,
    borderColor: "transparent",
  },
  sentimentActive: { borderColor: palette.navy },
  sentimentText: {
    color: palette.navy,
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
  },
  foodStarRow: { flexDirection: "row", gap: 9, marginBottom: 14 },
  reviewUploadGrid: { flexDirection: "row", gap: 9 },
  reviewUpload: {
    flex: 1,
    minHeight: 93,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#AFCDEB",
    backgroundColor: "#F7FBFF",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewUploadTitle: {
    color: palette.navy,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 6,
  },
  reviewUploadMeta: { color: palette.muted, fontSize: 8, marginTop: 2 },
  reviewPrivacy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ECF9F2",
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  marketHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  sellButton: {
    backgroundColor: palette.green,
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  sellButtonText: { color: "white", fontWeight: "900", fontSize: 11 },
  commission: {
    backgroundColor: palette.sky,
    borderRadius: 13,
    padding: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 15,
  },
  marketCategoryScroller: { marginVertical: 11 },
  marketCategoryRow: { gap: 8, paddingRight: 12 },
  marketCategory: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  marketCategoryActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  marketCategoryText: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  marketCategoryTextActive: { color: "white" },
  marketAffordability: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#ECF9F2",
    marginBottom: 8,
  },
  marketAffordabilityText: {
    flex: 1,
    color: "#397653",
    fontSize: 9,
    lineHeight: 14,
  },
  productGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 },
  productCard: { width: "50%", padding: 6 },
  productImage: {
    height: 145,
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#EEF2F6",
  },
  productBody: { paddingVertical: 8 },
  productName: { color: palette.navy, fontWeight: "900", fontSize: 14 },
  productConditionPill: {
    alignSelf: "flex-start",
    backgroundColor: "#F0F4F8",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 5,
  },
  productCondition: { color: palette.muted, fontSize: 9, fontWeight: "700" },
  productPrice: {
    color: palette.blue,
    fontWeight: "900",
    fontSize: 16,
    marginTop: 5,
  },
  marketEmpty: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
    paddingHorizontal: 28,
  },
  marketEmptyTitle: {
    color: palette.navy,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 10,
    marginBottom: 4,
  },
  productDetailBody: { padding: 18, paddingBottom: 45 },
  productDetailImage: {
    width: "100%",
    aspectRatio: 1.35,
    borderRadius: 20,
    backgroundColor: "#EEF2F6",
  },
  productDetailHeadline: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 15,
  },
  productDetailName: {
    color: palette.navy,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "900",
  },
  productDetailPrice: { color: palette.blue, fontSize: 24, fontWeight: "900" },
  productFacts: { flexDirection: "row", gap: 7, marginTop: 14 },
  productFact: {
    flex: 1,
    minHeight: 66,
    borderRadius: 13,
    backgroundColor: "#F3F7FB",
    padding: 10,
  },
  productFactLabel: { color: palette.muted, fontSize: 8, fontWeight: "900" },
  productFactValue: {
    color: palette.navy,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  productDescription: { color: palette.ink, fontSize: 12, lineHeight: 19 },
  handoverCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: "#CFE3F8",
    borderRadius: 15,
    padding: 13,
    backgroundColor: "#F7FBFF",
    marginTop: 15,
  },
  handoverIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  handoverTitle: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  handoverText: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
  },
  productSeller: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 15,
    padding: 12,
    marginTop: 13,
  },
  productSellerAvatar: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#E9E0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  productSellerInitial: { color: "#6D3EEB", fontSize: 17, fontWeight: "900" },
  productSellerName: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  productDetailActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 16,
  },
  productMessageButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: palette.blue,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  productMessageText: { color: palette.blue, fontSize: 11, fontWeight: "900" },
  productBuyButton: { flex: 1, marginTop: 0 },
  marketRules: {
    backgroundColor: "#ECF9F2",
    borderRadius: 13,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 15,
  },
  marketRulesText: { flex: 1, color: "#397653", fontSize: 9, lineHeight: 14 },
  fairPriceCard: {
    borderWidth: 1,
    borderColor: "#A8DDC0",
    backgroundColor: "#F1FBF5",
    borderRadius: 14,
    padding: 13,
    marginBottom: 8,
  },
  fairPriceHigh: { borderColor: "#F3C5C8", backgroundColor: "#FFF3F4" },
  fairPriceHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  fairPriceTitle: { color: "#28754C", fontSize: 12, fontWeight: "900" },
  fairPriceRange: {
    color: palette.navy,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  fairPriceHint: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
  },
  deliveryOptions: { flexDirection: "row", gap: 8 },
  deliveryOption: {
    flex: 1,
    minHeight: 86,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 14,
    padding: 11,
    justifyContent: "center",
  },
  deliveryOptionActive: {
    borderColor: palette.blue,
    backgroundColor: "#F2F8FE",
  },
  deliveryTitle: {
    color: palette.navy,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 6,
  },
  deliveryHint: { color: palette.muted, fontSize: 9, marginTop: 3 },
  addressPrivacy: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: palette.sky,
    borderRadius: 12,
    padding: 11,
  },
  addressPrivacyText: {
    flex: 1,
    color: palette.navy,
    fontSize: 9,
    lineHeight: 14,
  },
  friendFilterShell: {
    position: "relative",
    marginHorizontal: -18,
    marginBottom: 10,
  },
  friendFilterScroller: { flexGrow: 0 },
  friendFilterRow: { paddingLeft: 18, paddingRight: 60, alignItems: "center" },
  friendFilterArrow: {
    position: "absolute",
    top: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#D9E6F4",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B2E67",
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  friendFilterArrowLeft: { left: 7 },
  friendFilterArrowRight: { right: 7 },
  matchSourceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#F1F7FD",
    borderWidth: 1,
    borderColor: "#D7E8F7",
    borderRadius: 15,
    padding: 13,
    marginBottom: 8,
  },
  matchSourceTitle: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  matchSourceText: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  notificationBody: { padding: 18, paddingBottom: 45 },
  notificationIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.sky,
    borderRadius: 17,
    padding: 14,
  },
  notificationIntroIcon: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationFilters: {
    flexDirection: "row",
    gap: 6,
    marginTop: 16,
    backgroundColor: "#F1F4F8",
    borderRadius: 15,
    padding: 4,
  },
  notificationFilter: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    paddingHorizontal: 3,
  },
  notificationFilterActive: {
    backgroundColor: "white",
    shadowColor: "#29486F",
    shadowOpacity: 0.1,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
  },
  notificationFilterText: {
    color: palette.muted,
    fontWeight: "800",
    fontSize: 10,
  },
  notificationFilterTextActive: { color: palette.navy },
  notificationDate: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 22,
    marginBottom: 7,
  },
  notificationCard: {
    position: "relative",
    flexDirection: "row",
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingVertical: 16,
  },
  notificationIconWrap: { width: 43, height: 43, position: "relative" },
  notificationIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  notificationTitle: {
    flex: 1,
    color: palette.navy,
    fontWeight: "900",
    fontSize: 14,
  },
  notificationTime: {
    minWidth: 48,
    color: palette.muted,
    fontSize: 9,
    textAlign: "right",
  },
  notificationText: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    paddingRight: 5,
  },
  ticketAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: palette.blue,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  ticketActionText: { color: "white", fontSize: 10, fontWeight: "900" },
  unreadDot: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "white",
    backgroundColor: palette.coral,
  },
  ticketPassScreen: { flex: 1, backgroundColor: "#061A3F" },
  ticketPassHead: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  ticketPassHeadTitle: { color: "white", fontSize: 18, fontWeight: "900" },
  ticketPassClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.1)",
  },
  ticketPassBody: { padding: 18, paddingBottom: 45 },
  ticketPassHero: {
    minHeight: 182,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 21,
    justifyContent: "space-between",
  },
  ticketPassBrand: { flexDirection: "row", alignItems: "center", gap: 8 },
  ticketPassMark: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  ticketPassMarkText: { color: palette.blue, fontWeight: "900", fontSize: 17 },
  ticketPassBrandText: {
    color: "white",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  ticketPassEvent: {
    color: "white",
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
    marginTop: 20,
  },
  ticketPassAdmit: {
    color: "#BBDCF9",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginTop: 8,
  },
  ticketPassCard: {
    backgroundColor: "white",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    padding: 20,
    alignItems: "center",
  },
  qrFrame: {
    backgroundColor: "white",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
  },
  ticketCode: {
    color: palette.navy,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginTop: 13,
  },
  ticketDemo: {
    color: palette.coral,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 5,
  },
  ticketDivider: {
    alignSelf: "stretch",
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    marginVertical: 18,
  },
  ticketInfoGrid: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  ticketInfo: { width: "50%", paddingVertical: 8 },
  ticketInfoLabel: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  ticketInfoValue: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  ticketSecurity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,.08)",
    marginTop: 14,
  },
  ticketSecurityText: {
    flex: 1,
    color: "#D0E5F8",
    fontSize: 10,
    lineHeight: 15,
  },
  walletButton: {
    minHeight: 50,
    borderRadius: 14,
    marginTop: 13,
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  walletButtonText: { color: palette.navy, fontWeight: "900" },
  waitingPolicy: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#F3F8FD",
    borderRadius: 13,
    padding: 12,
    marginTop: 14,
  },
  waitingPolicyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  waitingPolicyTitle: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  waitingPolicyText: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 15,
    marginTop: 3,
  },
  airportAutoNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#F7FAFD",
  },
  airportAutoText: { color: palette.muted, fontSize: 9, flex: 1 },
  cleanTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  cleanType: {
    width: "50%",
    minHeight: 72,
    borderWidth: 1,
    borderColor: "#D5E0EB",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    transform: [{ scale: 0.97 }],
  },
  cleanTypeActive: { backgroundColor: palette.blue, borderColor: palette.blue },
  cleanTypeText: {
    color: palette.navy,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 4,
  },
  cleanTypeTextActive: { color: "white" },
  counterCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 14,
    overflow: "hidden",
  },
  counterRow: {
    minHeight: 55,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  counterLabel: {
    flex: 1,
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  counterControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  counterButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    minWidth: 18,
    textAlign: "center",
    color: palette.navy,
    fontWeight: "900",
  },
  calendarCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 16,
    padding: 12,
  },
  calendarCardCompact: { padding: 8, borderRadius: 13 },
  calendarHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calendarHeadCompact: { marginBottom: 3 },
  calendarArrow: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: "#F2F5F8",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarArrowCompact: { width: 28, height: 28, borderRadius: 14 },
  calendarArrowDisabled: { backgroundColor: "#F7F8FA" },
  calendarMonth: {
    color: palette.navy,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  calendarSub: {
    color: palette.muted,
    fontSize: 9,
    textAlign: "center",
    marginTop: 2,
  },
  weekRow: { flexDirection: "row" },
  weekday: {
    width: "14.285%",
    textAlign: "center",
    color: palette.muted,
    fontSize: 9,
    fontWeight: "900",
    paddingVertical: 6,
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDay: {
    width: "14.285%",
    aspectRatio: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayCompact: { aspectRatio: 1.28 },
  calendarDayUnavailable: { opacity: 0.35 },
  calendarDayLimited: { backgroundColor: "#FFF8E7" },
  calendarDaySelected: { backgroundColor: palette.blue },
  calendarDayText: { color: palette.ink, fontSize: 11, fontWeight: "700" },
  calendarDayTextUnavailable: {
    color: palette.muted,
    textDecorationLine: "line-through",
  },
  calendarDayTextSelected: { color: "white", fontWeight: "900" },
  limitedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#F2B94B",
    position: "absolute",
    bottom: 3,
  },
  calendarLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 13,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: palette.muted, fontSize: 8 },
  textAreaField: { minHeight: 128 },
  textAreaInput: {
    minHeight: 88,
    color: palette.ink,
    fontSize: 12,
    lineHeight: 18,
  },
  photoHelp: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 9,
  },
  cleanPhotoPicker: {
    minHeight: 112,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#AFCDEB",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7FBFF",
  },
  cleanPhotoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginTop: 9,
  },
  cleanPhotoWrap: { width: "33.33%", padding: 4 },
  cleanPhoto: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 11,
    backgroundColor: "#EEF2F6",
  },
  removePhoto: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(8,38,95,.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  cleanSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: palette.sky,
    borderRadius: 12,
    padding: 11,
    marginTop: 14,
  },
  cleanSummaryText: {
    flex: 1,
    color: palette.navy,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 15,
  },
  movingNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#EAF8F8",
    marginTop: 12,
  },
  movingNoticeText: {
    flex: 1,
    color: "#135E62",
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
  },
  crewGrid: { gap: 8 },
  crewOption: {
    minHeight: 65,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  crewOptionActive: { borderColor: palette.blue, backgroundColor: "#F2F8FE" },
  crewTitle: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  crewHint: { color: palette.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  eventsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  postEventButton: {
    minHeight: 38,
    borderRadius: 13,
    backgroundColor: palette.coral,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  postEventButtonText: { color: "white", fontSize: 11, fontWeight: "900" },
  customItemsList: { gap: 11, marginTop: 12 },
  customItemCard: {
    borderWidth: 1,
    borderColor: "#CFE0F1",
    borderRadius: 16,
    padding: 13,
    backgroundColor: "#FAFCFF",
  },
  customItemHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 2,
  },
  customItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.sky,
  },
  customItemTitle: { color: palette.navy, fontSize: 13, fontWeight: "900" },
  customItemSubtitle: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 2,
  },
  customMeasureLabel: {
    color: palette.navy,
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 7,
  },
  customDimensions: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  customDimensionField: {
    flex: 1,
    minHeight: 63,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingTop: 7,
    backgroundColor: "white",
  },
  customDimensionLabel: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "800",
  },
  customDimensionInput: {
    flex: 1,
    color: palette.ink,
    fontSize: 12,
    paddingVertical: 4,
  },
  customUnit: {
    minWidth: 45,
    height: 48,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    backgroundColor: "#F2F6FA",
    alignItems: "center",
    justifyContent: "center",
  },
  customUnitText: { color: palette.navy, fontSize: 10, fontWeight: "900" },
  customWeightRow: { flexDirection: "row", alignItems: "flex-end", gap: 7 },
  customWeightField: { flex: 1 },
  customNotesField: { marginBottom: 0 },
  bookingFilters: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#F1F4F8",
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  bookingFilter: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingFilterActive: {
    backgroundColor: "white",
    shadowColor: "#29486F",
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  bookingFilterText: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  bookingFilterTextActive: { color: palette.navy },
  bookingCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 17,
    backgroundColor: "white",
    marginBottom: 13,
    overflow: "hidden",
  },
  bookingHead: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  bookingIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingType: {
    flex: 1,
    color: palette.navy,
    fontSize: 11,
    fontWeight: "900",
  },
  bookingStatus: { fontSize: 10, fontWeight: "900" },
  bookingMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 15,
  },
  bookingTitle: { color: palette.ink, fontSize: 16, fontWeight: "900" },
  bookingDetail: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  bookingPrice: { color: palette.navy, fontSize: 17, fontWeight: "900" },
  bookingActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 13,
    paddingBottom: 13,
  },
  bookingTextAction: {
    minHeight: 35,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D6E0EA",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingTextActionLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  bookingPrimaryAction: {
    minHeight: 35,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.blue,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingPrimaryActionLabel: {
    color: palette.blue,
    fontSize: 10,
    fontWeight: "900",
  },
  supportBody: { padding: 18, paddingBottom: 45 },
  supportBookingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 15,
    padding: 13,
  },
  supportBookingTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },
  supportPromise: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#ECF9F2",
    borderRadius: 13,
    padding: 12,
    marginTop: 12,
  },
  supportPromiseText: {
    flex: 1,
    color: "#397653",
    fontSize: 9,
    lineHeight: 14,
  },
  supportOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 67,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingVertical: 10,
  },
  supportOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  supportOptionTitle: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  supportOptionText: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  ratingCard: {
    backgroundColor: "#FFF9EC",
    borderRadius: 16,
    padding: 15,
    marginTop: 17,
  },
  ratingStars: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 13,
    maxWidth: 240,
  },
  satisfactionRow: { flexDirection: "row", gap: 7, marginTop: 13 },
  satisfactionChip: {
    flex: 1,
    minHeight: 35,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E4D7B8",
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  satisfactionChipActive: {
    borderColor: "#F2A91B",
    backgroundColor: "#FFF2C9",
  },
  satisfactionText: { color: palette.muted, fontSize: 9, fontWeight: "800" },
  satisfactionTextActive: { color: "#8A5B00" },
  messageSafety: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
    borderRadius: 15,
    backgroundColor: "#ECF9F2",
    marginBottom: 10,
  },
  messageSafetyTitle: { color: "#17673B", fontSize: 12, fontWeight: "900" },
  messageSafetyText: {
    color: "#397653",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  messageAvatarWrap: { width: 48, height: 48, position: "relative" },
  messageAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  messageTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  messageTitle: {
    flex: 1,
    color: palette.navy,
    fontSize: 14,
    fontWeight: "900",
  },
  messageTime: {
    width: 56,
    color: palette.muted,
    fontSize: 9,
    textAlign: "right",
  },
  messageType: {
    color: palette.blue,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  messagePreview: { color: palette.muted, fontSize: 11, marginTop: 4 },
  messageBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.coral,
    borderWidth: 2,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  messageBadgeText: { color: "white", fontSize: 8, fontWeight: "900" },
  chatScreen: { flex: 1, backgroundColor: "#F5F8FC" },
  chatHead: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  chatAvatar: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  chatTitle: { color: palette.navy, fontSize: 14, fontWeight: "900" },
  chatType: { color: palette.muted, fontSize: 9, marginTop: 2 },
  chatSafety: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 11,
    backgroundColor: "#ECF9F2",
  },
  chatSafetyText: { flex: 1, color: "#397653", fontSize: 9, lineHeight: 13 },
  chatMessages: { flexGrow: 1, padding: 16, gap: 12 },
  incomingBubble: {
    alignSelf: "flex-start",
    maxWidth: "82%",
    backgroundColor: "white",
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    padding: 12,
  },
  incomingText: { color: palette.ink, fontSize: 12, lineHeight: 18 },
  outgoingBubble: {
    alignSelf: "flex-end",
    maxWidth: "82%",
    backgroundColor: palette.blue,
    borderRadius: 16,
    borderBottomRightRadius: 5,
    padding: 12,
  },
  outgoingText: { color: "white", fontSize: 12, lineHeight: 18 },
  chatComposerArea: {
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  chatComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    backgroundColor: "white",
  },
  chatToolButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F1F6FB",
    alignItems: "center",
    justifyContent: "center",
  },
  chatToolButtonActive: { backgroundColor: "#DCEEFF" },
  chatInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: "#F1F4F8",
    paddingHorizontal: 14,
    color: palette.ink,
  },
  chatSend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  chatSendDisabled: { backgroundColor: "#A8C9EA" },
  emojiTray: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 11,
    paddingTop: 10,
    gap: 5,
  },
  emojiOption: {
    width: 38,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F8FC",
  },
  emojiText: { fontSize: 21 },
  attachmentPreviewRow: { gap: 8, paddingHorizontal: 11, paddingTop: 10 },
  attachmentPreview: {
    width: 112,
    height: 60,
    borderRadius: 12,
    backgroundColor: "#F2F6FA",
    borderWidth: 1,
    borderColor: "#DCE5EF",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  attachmentPreviewImage: { width: 42, height: 42, borderRadius: 8 },
  attachmentPreviewName: {
    flex: 1,
    color: palette.navy,
    fontSize: 8,
    fontWeight: "800",
  },
  attachmentRemove: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: palette.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  sentMessageGroup: { alignSelf: "flex-end", maxWidth: "86%", gap: 6 },
  sentAttachmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 5,
  },
  sentAttachmentImage: {
    width: 92,
    height: 92,
    borderRadius: 13,
    backgroundColor: "#E8EEF5",
  },
  sentFileCard: {
    width: 170,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#CFE0F1",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
  },
  sentFileName: {
    flex: 1,
    color: palette.navy,
    fontSize: 9,
    fontWeight: "800",
  },
  eventAttendance: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: "#D9E8F6",
    backgroundColor: "#F5FAFF",
    borderRadius: 13,
    marginTop: 8,
    overflow: "hidden",
  },
  eventAttendanceItem: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  eventAttendanceDivider: {
    width: 1,
    backgroundColor: "#D9E8F6",
    marginVertical: 9,
  },
  eventAttendanceValue: {
    color: palette.navy,
    fontSize: 13,
    fontWeight: "900",
  },
  eventAttendanceLabel: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 1,
  },
  confirmGoingButton: {
    width: 128,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.green,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  confirmGoingText: { color: "white", fontSize: 10, fontWeight: "900" },
  viewEventHint: {
    width: 128,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.sky,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  viewEventHintText: { color: palette.blue, fontSize: 9, fontWeight: "900" },
  groupChatNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: palette.sky,
    borderRadius: 14,
    padding: 12,
    marginBottom: 13,
  },
  friendUsername: { color: palette.muted, fontSize: 11, marginTop: 2 },
  friendStatusPill: { backgroundColor: "#E9F8F0" },
  socialUnlocked: { borderColor: "#A8DDC0", backgroundColor: "#F1FBF5" },
  friendProfileActions: { flexDirection: "row", gap: 9, alignItems: "center" },
  friendMessageButton: { flex: 1 },
  manageFriendButton: {
    minHeight: 51,
    minWidth: 92,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  manageFriendText: { color: palette.muted, fontSize: 10, fontWeight: "900" },
  friendMoreButton: {
    width: 35,
    height: 35,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5,
    backgroundColor: "#F3F6F9",
  },
  requestModeTabs: {
    flexDirection: "row",
    borderRadius: 13,
    backgroundColor: "#F1F4F8",
    padding: 4,
    marginBottom: 8,
  },
  requestModeTab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  requestModeTabActive: { backgroundColor: "white" },
  requestModeText: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  requestModeTextActive: { color: palette.navy },
  retractButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#F0B9BD",
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginTop: 9,
  },
  retractButtonText: { color: palette.coral, fontSize: 9, fontWeight: "900" },
  requestOverview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 17,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#F2F8FE",
    borderWidth: 1,
    borderColor: "#D7E8F7",
  },
  requestOverviewIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    shadowColor: "#173A65",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  requestOverviewTitle: {
    color: palette.navy,
    fontSize: 14,
    fontWeight: "900",
  },
  requestOverviewText: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  requestCardPro: {
    borderWidth: 1,
    borderColor: "#DCE5EF",
    borderRadius: 18,
    backgroundColor: "white",
    padding: 14,
    marginTop: 11,
    shadowColor: "#173A65",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  requestIdentityRow: { flexDirection: "row", alignItems: "center" },
  requestAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 3,
    borderColor: "white",
    shadowColor: "#173A65",
    shadowOpacity: 0.1,
    shadowRadius: 7,
  },
  requestAvatarText: { color: palette.navy, fontSize: 15, fontWeight: "900" },
  requestNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  requestName: { color: palette.navy, fontSize: 16, fontWeight: "900" },
  requestUniversity: {
    color: palette.blue,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },
  requestTime: { color: palette.muted, fontSize: 9, marginTop: 4 },
  requestMatchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#F6F9FC",
    borderRadius: 13,
    padding: 10,
    marginTop: 13,
  },
  requestMatchTitle: { color: palette.navy, fontSize: 9, fontWeight: "900" },
  requestMatchText: { color: palette.muted, fontSize: 9, marginTop: 2 },
  requestActionsPro: { flexDirection: "row", gap: 8, marginTop: 13 },
  acceptButtonPro: {
    flex: 1.25,
    minHeight: 43,
    borderRadius: 13,
    backgroundColor: palette.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  acceptTextPro: { color: "white", fontSize: 11, fontWeight: "900" },
  declineButtonPro: {
    flex: 1,
    minHeight: 43,
    borderRadius: 13,
    backgroundColor: "#F1F4F8",
    alignItems: "center",
    justifyContent: "center",
  },
  declineTextPro: { color: palette.muted, fontSize: 11, fontWeight: "900" },
  retractButtonPro: {
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#F2C7CA",
    backgroundColor: "#FFF7F7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 13,
  },
  retractButtonTextPro: {
    color: palette.coral,
    fontSize: 10,
    fontWeight: "900",
  },
  requestSafetyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 15,
    backgroundColor: "#F1FAF5",
    padding: 13,
    marginTop: 15,
    borderWidth: 1,
    borderColor: "#D5EDDF",
  },
  requestSafetyIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  requestSafetyTitle: { color: "#226E48", fontSize: 11, fontWeight: "900" },
  requestSafetyText: {
    color: "#4C765F",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  requestEmptyState: { alignItems: "center", paddingVertical: 34 },
  requestEmptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F2F8FE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  requestEmptyText: { color: palette.muted, fontSize: 10, marginTop: 4 },
  addFriendBody: { padding: 18, paddingBottom: 42 },
  addMethodGrid: { flexDirection: "row", gap: 7, marginTop: 16 },
  addMethod: {
    flex: 1,
    minHeight: 78,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 4,
  },
  addMethodActive: { borderColor: palette.blue, backgroundColor: "#F2F8FE" },
  addMethodText: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  addMethodTextActive: { color: palette.navy },
  contactPermissionCard: {
    alignItems: "center",
    backgroundColor: "#F5FAF7",
    borderRadius: 16,
    padding: 18,
    marginTop: 16,
  },
  belongingsNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: "#F0DDAF",
    backgroundColor: "#FFF9EC",
    borderRadius: 13,
    padding: 12,
    marginTop: 13,
  },
  belongingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  belongingsTitle: { color: "#704A00", fontSize: 11, fontWeight: "900" },
  belongingsText: {
    color: "#876A2D",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  messageAvatarPhoto: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#EEF2F6",
  },
  staffVerifiedMini: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.green,
    borderWidth: 2,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  chatStaffPhoto: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#EEF2F6",
  },
  chatHeadAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F6FB",
  },
  groupChatBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: palette.sky,
    padding: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#CFE4F8",
  },
  staffProfileBody: { padding: 18, paddingBottom: 45, alignItems: "center" },
  staffProfilePhoto: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "#EEF2F6",
  },
  approvedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.green,
    borderRadius: 13,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: -13,
    borderWidth: 3,
    borderColor: "white",
  },
  approvedPillText: {
    color: "white",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  staffProfileName: {
    color: palette.navy,
    fontSize: 23,
    fontWeight: "900",
    marginTop: 10,
  },
  staffProfileRole: { color: palette.muted, fontSize: 12, marginTop: 3 },
  staffStats: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 17,
  },
  staffStat: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#F3F7FB",
    borderRadius: 14,
    padding: 13,
  },
  staffStatValue: { color: palette.navy, fontSize: 17, fontWeight: "900" },
  staffStatLabel: { color: palette.muted, fontSize: 9, marginTop: 3 },
  staffChecks: { alignSelf: "stretch", gap: 8 },
  staffCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 12,
    padding: 10,
  },
  staffCheckText: { color: palette.ink, fontSize: 11, fontWeight: "700" },
  staffReview: {
    alignSelf: "stretch",
    borderRadius: 15,
    backgroundColor: "#FFF9EC",
    padding: 14,
  },
  staffReviewStars: { color: "#F2A91B", fontSize: 16, letterSpacing: 2 },
  staffReviewText: {
    color: palette.ink,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  staffReviewMeta: { color: palette.muted, fontSize: 9, marginTop: 8 },
  groupMembersBody: { padding: 18, paddingBottom: 45 },
  groupPrivacy: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: palette.sky,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  groupPrivacyText: {
    flex: 1,
    color: palette.navy,
    fontSize: 9,
    lineHeight: 14,
  },
  groupMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingVertical: 13,
  },
  groupMemberAvatar: { width: 46, height: 46, borderRadius: 23 },
  darkSafe: { backgroundColor: "#0F1929" },
  darkHeader: { backgroundColor: "#111D30", borderBottomColor: "#30415A" },
  brandLogoDark: { tintColor: "#F5F8FF" },
  darkContent: { backgroundColor: "#0F1929" },
  darkTabBar: { backgroundColor: "#111D30", borderTopColor: "#30415A" },
  attendingButton: {
    backgroundColor: palette.green,
    flexDirection: "row",
    gap: 7,
  },
  visitDateWrap: { marginTop: 12 },
  visitDateButton: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
  },
  visitDateValue: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  visitCalendar: {
    borderWidth: 1,
    borderColor: "#C9D8E8",
    borderTopWidth: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 11,
    backgroundColor: "white",
  },
  fairPriceCaution: { borderColor: "#F2D388", backgroundColor: "#FFF9E8" },
  priceScaleWrap: { marginTop: 10 },
  priceMarkerRow: { height: 31, marginHorizontal: 8, position: "relative" },
  priceMarker: {
    position: "absolute",
    transform: [{ translateX: -18 }],
    alignItems: "center",
  },
  priceMarkerText: {
    color: palette.navy,
    fontSize: 9,
    fontWeight: "900",
    backgroundColor: "white",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priceScale: {
    height: 11,
    borderRadius: 6,
    overflow: "hidden",
    flexDirection: "row",
  },
  priceScaleSegment: { flex: 1 },
  priceLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  priceLegendText: {
    width: "33.33%",
    color: palette.muted,
    fontSize: 7,
    fontWeight: "800",
    textAlign: "center",
  },
  sellerPayoutCard: {
    borderWidth: 1,
    borderColor: "#A8DDC0",
    borderRadius: 15,
    backgroundColor: "#F1FBF5",
    padding: 13,
    marginTop: 13,
  },
  payoutHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  payoutTitle: { color: "#28754C", fontSize: 13, fontWeight: "900" },
  payoutLine: { flexDirection: "row", alignItems: "center", minHeight: 29 },
  payoutLabel: { flex: 1, color: palette.muted, fontSize: 10 },
  payoutValue: { color: palette.ink, fontSize: 11, fontWeight: "800" },
  payoutFee: { color: palette.coral, fontSize: 11, fontWeight: "800" },
  payoutTotal: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#CFE8D9",
    paddingTop: 9,
    marginTop: 4,
  },
  payoutTotalLabel: {
    flex: 1,
    color: palette.navy,
    fontSize: 11,
    fontWeight: "900",
  },
  payoutTotalValue: { color: palette.green, fontSize: 19, fontWeight: "900" },
  payoutHint: { color: palette.muted, fontSize: 8, marginTop: 7 },
  friendMainTabs: { minWidth: "100%" },
  friendNotificationStatus: {
    color: palette.green,
    fontSize: 8,
    fontWeight: "800",
    marginTop: 4,
  },
  followingNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    backgroundColor: palette.sky,
    padding: 12,
    marginBottom: 7,
  },
  followingButton: {
    borderWidth: 1,
    borderColor: "#BFD7ED",
    borderRadius: 15,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginLeft: 7,
  },
  followingButtonText: { color: palette.blue, fontSize: 8, fontWeight: "900" },
  profilePhotoWrap: { width: 90, height: 90, position: "relative" },
  profilePhoto: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#EEF2F6",
  },
  profileCamera: {
    position: "absolute",
    right: 1,
    bottom: 5,
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: palette.blue,
    borderWidth: 2,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  profileDisplayName: {
    color: palette.navy,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 8,
  },
  viewProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#BFD7ED",
    backgroundColor: "#F5FAFF",
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
    marginTop: 11,
  },
  viewProfileButtonText: {
    color: palette.blue,
    fontSize: 10,
    fontWeight: "900",
  },
  publicProfileBody: { padding: 18, paddingBottom: 45 },
  publicProfileHero: { alignItems: "center", paddingVertical: 8 },
  publicProfilePhoto: {
    width: 102,
    height: 102,
    borderRadius: 51,
    marginRight: 0,
    backgroundColor: "#EEF2F6",
    alignItems: "center",
    justifyContent: "center",
  },
  publicProfileName: {
    color: palette.navy,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 11,
  },
  publicBio: {
    color: palette.ink,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: "#F6F9FC",
    borderRadius: 14,
    padding: 13,
  },
  profileActivityHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileActivityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 14,
    padding: 10,
    marginBottom: 9,
  },
  profileActivityImage: {
    width: 66,
    height: 57,
    borderRadius: 10,
    backgroundColor: "#EEF2F6",
  },
  editPhotoButton: { alignItems: "center", gap: 8, marginBottom: 8 },
  editPhotoPreview: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  usernameStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  usernameStatusText: { fontSize: 8, fontWeight: "900" },
  interestTagPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 10,
  },
  interestTagOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#CFE0F1",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 11,
    backgroundColor: "white",
  },
  interestTagOptionActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  interestTagOptionText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  interestTagOptionTextActive: { color: "white" },
  customInterestRow: { flexDirection: "row", gap: 7, marginTop: 11 },
  customInterestInput: {
    flex: 1,
    minHeight: 45,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 12,
    paddingHorizontal: 12,
    color: palette.ink,
  },
  customInterestAdd: {
    width: 45,
    height: 45,
    borderRadius: 13,
    backgroundColor: palette.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  verificationBody: { padding: 18, paddingBottom: 45 },
  verificationHero: { alignItems: "center", paddingVertical: 8 },
  verificationTick: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: palette.green,
    alignItems: "center",
    justifyContent: "center",
  },
  verificationTitle: {
    color: palette.navy,
    fontSize: 23,
    fontWeight: "900",
    marginTop: 10,
  },
  verificationText: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 390,
  },
  verificationChecks: { gap: 8, marginTop: 15 },
  verificationCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 13,
    padding: 10,
  },
  verificationCheckIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#ECF9F2",
    alignItems: "center",
    justifyContent: "center",
  },
  verificationPrivacy: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: palette.sky,
    borderRadius: 13,
    padding: 12,
    marginTop: 13,
  },
  verificationPrivacyText: {
    flex: 1,
    color: palette.navy,
    fontSize: 9,
    lineHeight: 14,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: palette.blue,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
  },
  secondaryButtonText: { color: palette.blue, fontSize: 12, fontWeight: "900" },
  verificationStepIntro: {
    backgroundColor: "#F4F8FC",
    borderRadius: 14,
    padding: 13,
  },
  verificationUploadRow: { flexDirection: "row", gap: 9, marginTop: 13 },
  verificationUpload: {
    flex: 1,
    minHeight: 226,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#AFCDEB",
    backgroundColor: "#F7FBFF",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 86,
    paddingBottom: 10,
    overflow: "hidden",
  },
  verificationUploadDone: { borderStyle: "solid", borderColor: palette.green },
  verificationUploadImage: {
    width: "100%",
    height: 82,
    position: "absolute",
    top: 0,
  },
  verificationUploadTitle: {
    color: palette.navy,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 8,
  },
  verificationUploadMeta: { color: palette.muted, fontSize: 8, marginTop: 3 },
  backToStatus: { alignItems: "center", padding: 13 },
  backToStatusText: { color: palette.blue, fontSize: 10, fontWeight: "800" },
  locationSheet: { padding: 18 },
  currentLocation: {
    borderWidth: 1,
    borderColor: "#CFE3F8",
    backgroundColor: palette.sky,
    borderRadius: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  locationIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  currentTitle: { color: palette.navy, fontWeight: "900", fontSize: 15 },
  orText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    marginVertical: 18,
    letterSpacing: 1,
  },
  manualLocation: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 13,
    height: 50,
    paddingHorizontal: 12,
  },
  addressResults: { marginTop: 12, gap: 7 },
  addressResultsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 },
  addressResultsTitle: { color: palette.navy, fontSize: 11, fontWeight: "900" },
  addressResultsCount: { color: palette.muted, fontSize: 9, fontWeight: "700" },
  addressSuggestion: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#DDE6F0", borderRadius: 13, paddingHorizontal: 11, backgroundColor: "white" },
  addressSuggestionSelected: { borderColor: palette.green, backgroundColor: "#F1FBF5" },
  addressNumber: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.sky, alignItems: "center", justifyContent: "center" },
  addressSuggestionMain: { color: palette.navy, fontSize: 11, fontWeight: "800" },
  addressSuggestionPostcode: { color: palette.muted, fontSize: 9, marginTop: 3 },
  addressNoResults: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13, borderRadius: 13, backgroundColor: "#F5F7FA" },
  addressNoResultsText: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 15 },
  quickLocationsTitle: { color: palette.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  quickLocations: { marginTop: 13 },
  quickLocation: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  supportBack: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
  },
  supportBackText: { color: palette.blue, fontSize: 10, fontWeight: "900" },
  supportFlowTitle: { color: palette.navy, fontSize: 23, fontWeight: "900" },
  supportFlowSubtitle: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  supportRuleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#FFF8E7",
    borderWidth: 1,
    borderColor: "#F1DC9E",
    borderRadius: 14,
    padding: 12,
    marginTop: 15,
  },
  supportRuleText: { flex: 1, color: "#785A17", fontSize: 10, lineHeight: 15 },
  supportInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: palette.sky,
    borderRadius: 14,
    padding: 12,
    marginTop: 15,
  },
  supportInfoText: {
    flex: 1,
    color: palette.navy,
    fontSize: 10,
    lineHeight: 15,
  },
  supportChoiceGrid: { flexDirection: "row", gap: 7 },
  supportChoice: {
    flex: 1,
    minHeight: 76,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 5,
  },
  supportChoiceActive: {
    borderColor: palette.blue,
    backgroundColor: "#F2F8FE",
  },
  supportChoiceText: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  supportChoiceTextActive: { color: palette.navy },
  supportReasonWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  supportReasonChip: {
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 11,
    backgroundColor: "white",
  },
  supportReasonChipActive: {
    borderColor: palette.blue,
    backgroundColor: palette.sky,
  },
  supportReasonText: { color: palette.muted, fontSize: 9, fontWeight: "800" },
  supportReasonTextActive: { color: palette.blue },
  supportEvidence: {
    minHeight: 48,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#AFCDEB",
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  supportEvidenceText: {
    flex: 1,
    color: palette.blue,
    fontSize: 10,
    fontWeight: "800",
  },
  supportAcknowledge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginTop: 14,
  },
  supportAcknowledgeText: {
    flex: 1,
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
  },
  botIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 2,
  },
  botIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.blue,
  },
  botName: { color: palette.navy, fontSize: 13, fontWeight: "900" },
  botMeta: { color: palette.muted, fontSize: 9, marginTop: 2 },
  faqGrid: { gap: 7 },
  faqButton: {
    minHeight: 45,
    borderWidth: 1,
    borderColor: "#CFE0F1",
    borderRadius: 13,
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  faqButtonText: {
    flex: 1,
    color: palette.navy,
    fontSize: 10,
    fontWeight: "800",
  },
  technicianButton: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: palette.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  technicianButtonText: { color: "white", fontSize: 11, fontWeight: "900" },
  technicianStatus: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#ECF9F2",
    borderRadius: 14,
    padding: 12,
  },
  technicianStatusTitle: { color: "#236E47", fontSize: 11, fontWeight: "900" },
  technicianStatusText: {
    color: "#4B765E",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  lostModeRow: { flexDirection: "row", gap: 8 },
  lostModeButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#BFD7ED",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "white",
  },
  lostModeButtonActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  lostModeText: { color: palette.blue, fontSize: 9, fontWeight: "900" },
  lostModeTextActive: { color: "white" },
  lostPhotoCard: { borderWidth: 1, borderColor: "#D8E5F1", borderRadius: 15, padding: 12, backgroundColor: "white" },
  lostPhotoHead: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  lostPhotoIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.sky, alignItems: "center", justifyContent: "center" },
  lostPhotoCount: { color: palette.blue, fontSize: 10, fontWeight: "900" },
  lostClaimCard: {
    alignItems: "center",
    backgroundColor: "#ECF9F2",
    borderRadius: 16,
    padding: 20,
  },
  lostClaimTitle: {
    color: "#236E47",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 7,
  },
  lostClaimReference: {
    color: palette.navy,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 6,
  },
  lostClaimText: {
    color: "#4B765E",
    fontSize: 9,
    lineHeight: 14,
    textAlign: "center",
    marginTop: 5,
  },
  universitySearchWrap: { marginTop: 4, zIndex: 5 },
  universitySearchField: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#D5E1ED", borderRadius: 13, paddingHorizontal: 12, backgroundColor: "white" },
  universitySearchFieldActive: { borderColor: palette.blue, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  universitySearchInput: { flex: 1, color: palette.ink, fontSize: 12, fontWeight: "700" },
  universitySuggestions: { borderWidth: 1, borderColor: "#D5E1ED", borderTopWidth: 0, borderBottomLeftRadius: 13, borderBottomRightRadius: 13, backgroundColor: "white", overflow: "hidden" },
  universitySuggestion: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: "#EDF1F6" },
  universitySuggestionSelected: { backgroundColor: "#F1FBF5" },
  universitySuggestionIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: palette.sky, alignItems: "center", justifyContent: "center" },
  universitySuggestionText: { flex: 1, color: palette.navy, fontSize: 10, fontWeight: "800" },
  universityEmpty: { padding: 13, backgroundColor: "#F7F9FC" },
  universityEmptyText: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  usernameLockedField: { backgroundColor: "#F3F5F8", opacity: 0.82 },
  usernamePolicy: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, borderRadius: 12, backgroundColor: palette.sky, marginTop: 8 },
  usernamePolicyText: { flex: 1, color: palette.navy, fontSize: 9, lineHeight: 14 },
  interestSuggestions: { marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: "#DCE6F0", backgroundColor: "white", padding: 8, gap: 4 },
  interestSuggestionsLabel: { color: palette.muted, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 2 },
  interestSuggestion: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 9, paddingHorizontal: 7, backgroundColor: "#F7FAFD" },
  interestSuggestionText: { color: palette.navy, fontSize: 10, fontWeight: "800" },
  bookingDetailSheet: { padding: 18, paddingBottom: 40 },
  bookingDetailHero: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14, borderRadius: 16, backgroundColor: "#F7FAFD", borderWidth: 1, borderColor: "#DDE7F1" },
  bookingDetailHeroIcon: { width: 50, height: 50, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  bookingDetailType: { color: palette.muted, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  bookingDetailTitle: { color: palette.navy, fontSize: 16, fontWeight: "900", marginTop: 3 },
  bookingDetailStatus: { color: palette.green, fontSize: 9, fontWeight: "800", marginTop: 3 },
  bookingDetailPrice: { color: palette.navy, fontSize: 18, fontWeight: "900" },
  bookingDetailFacts: { gap: 8, marginTop: 14 },
  bookingDetailFact: { minHeight: 58, flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderWidth: 1, borderColor: "#E0E7EF", borderRadius: 13, backgroundColor: "white" },
  bookingReferenceCard: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#ECF9F2", borderRadius: 13, padding: 12, marginTop: 14 },
  bookingReferenceText: { flex: 1, color: "#347253", fontSize: 9, lineHeight: 14 },
  eventDateField: { borderWidth: 1, borderColor: "#D7E1ED", borderRadius: 13, padding: 12, marginTop: 12, backgroundColor: "white" },
  eventTimeField: { borderWidth: 1, borderColor: "#D7E1ED", borderRadius: 13, padding: 12, marginTop: 12, backgroundColor: "white" },
  eventDateButton: { minHeight: 31, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eventDateButtonCopy: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventDateButtonText: { color: palette.navy, fontSize: 12, fontWeight: "800" },
  eventTimeValue: { color: palette.navy, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  eventTimeFormat: { color: palette.blue, fontSize: 8, fontWeight: "900", backgroundColor: palette.sky, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  eventCalendarPanel: { marginTop: 9, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 10 },
  eventCalendarPickerLabel: { color: palette.muted, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 5, marginBottom: 6 },
  eventCalendarChoiceRow: { gap: 6, paddingRight: 8 },
  eventCalendarChoice: { minHeight: 32, minWidth: 48, borderWidth: 1, borderColor: "#D6E1ED", borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, backgroundColor: "white" },
  eventCalendarChoiceActive: { backgroundColor: palette.blue, borderColor: palette.blue },
  eventCalendarChoiceDisabled: { backgroundColor: "#F1F3F6", borderColor: "#E4E8ED" },
  eventCalendarChoiceText: { color: palette.muted, fontSize: 9, fontWeight: "800" },
  eventCalendarChoiceTextActive: { color: "white" },
  eventTimePanel: { marginTop: 9, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 7 },
  eventTimeChoice: { width: 42, height: 34, borderWidth: 1, borderColor: "#D6E1ED", borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "white" },
  eventCalendarWindowNote: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: palette.sky, borderRadius: 10, padding: 9, marginBottom: 8 },
  eventCalendarWindowText: { flex: 1, color: palette.navy, fontSize: 9, fontWeight: "700" },
  eventCalendarYearRow: { flexDirection: "row", gap: 8 },
  eventCalendarYearChoice: { flex: 1 },
  eventCalendarMonthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  eventCalendarMonthChoice: { width: "23%", minHeight: 34, borderWidth: 1, borderColor: "#D6E1ED", borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "white" },
  eventCalendarDivider: { height: 1, backgroundColor: palette.line, marginVertical: 12 },
  eventTimeHeader: { alignItems: "center", marginBottom: 10 },
  eventTimePanelTitle: { color: palette.navy, fontSize: 13, fontWeight: "900" },
  eventTimePanelHint: { color: palette.muted, fontSize: 8, marginTop: 2 },
  eventTimeStepperRow: { flexDirection: "row", alignItems: "flex-end", gap: 9 },
  eventTimeSegment: { flex: 1 },
  eventTimeSegmentLabel: { color: palette.muted, fontSize: 8, fontWeight: "900", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 },
  eventTimeStepper: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#D6E1ED", borderRadius: 13, padding: 5, backgroundColor: "#F8FBFE" },
  eventTimeStepButton: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "white", borderWidth: 1, borderColor: "#D5E5F4" },
  eventTimeStepValue: { color: palette.navy, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  eventTimeColon: { color: palette.navy, fontSize: 24, fontWeight: "900", paddingBottom: 12 },
  eventTimeDone: { minHeight: 40, borderRadius: 11, backgroundColor: palette.blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 },
  eventTimeDoneText: { color: "white", fontSize: 10, fontWeight: "900" },
  technicianJoinedNotice: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginVertical: 5 },
  technicianJoinedNoticeText: { color: "#347253", fontSize: 10, fontWeight: "900" },
  technicianIdentity: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#B9E3CB", borderRadius: 15, padding: 10, backgroundColor: "#F2FBF6" },
  technicianPhoto: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#DCE5EF" },
  technicianNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  technicianName: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  technicianVerifiedPill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 9, backgroundColor: "#DDF5E7", paddingHorizontal: 6, paddingVertical: 3 },
  technicianVerifiedText: { color: "#28754C", fontSize: 7, fontWeight: "900" },
  technicianRole: { color: palette.muted, fontSize: 9, marginTop: 4 },
  technicianMessageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 2 },
  technicianMessagePhoto: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#DCE5EF" },
  technicianMessageAuthor: { color: palette.navy, fontSize: 9, fontWeight: "900", marginBottom: 4 },
  technicianMessageBubble: { alignSelf: "flex-start", backgroundColor: "white", borderRadius: 15, borderTopLeftRadius: 4, padding: 12, maxWidth: 360, shadowColor: "#17365E", shadowOpacity: 0.06, shadowRadius: 7 },
  endSupportSessionButton: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#BFD7ED", borderRadius: 15, backgroundColor: "#F8FBFE", paddingHorizontal: 13, marginTop: 8 },
  endSupportSessionTitle: { color: palette.navy, fontSize: 11, fontWeight: "900" },
  endSupportSessionText: { color: palette.muted, fontSize: 8, lineHeight: 12, marginTop: 2 },
  technicianRatingCard: { borderWidth: 1, borderColor: "#D7E4F1", borderRadius: 18, backgroundColor: "white", padding: 15, marginTop: 9 },
  technicianRatingHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  technicianRatingIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFF5D9", alignItems: "center", justifyContent: "center" },
  technicianRatingTitle: { color: palette.navy, fontSize: 13, fontWeight: "900" },
  technicianRatingSubtitle: { color: palette.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  technicianStars: { flexDirection: "row", justifyContent: "space-between", gap: 7, marginTop: 14 },
  technicianStarButton: { flex: 1, minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: "#DCE5EF", backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" },
  technicianStarButtonActive: { borderColor: "#E7B439", backgroundColor: "#FFF8DF" },
  technicianNoReviewNote: { flexDirection: "row", alignItems: "flex-start", gap: 7, borderRadius: 11, backgroundColor: palette.sky, padding: 9, marginTop: 12 },
  technicianNoReviewText: { flex: 1, color: palette.navy, fontSize: 8, lineHeight: 12 },
  submitTechnicianRating: { minHeight: 44, borderRadius: 12, backgroundColor: palette.blue, alignItems: "center", justifyContent: "center", marginTop: 11 },
  submitTechnicianRatingText: { color: "white", fontSize: 10, fontWeight: "900" },
  technicianRatingThanks: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderColor: "#B9E3CB", borderRadius: 15, backgroundColor: "#F2FBF6", padding: 13, marginTop: 9 },
  technicianRatingThanksIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.green, alignItems: "center", justifyContent: "center" },
  technicianRatingThanksTitle: { color: "#236E47", fontSize: 11, fontWeight: "900" },
  technicianRatingThanksText: { color: "#4B765E", fontSize: 9, lineHeight: 14, marginTop: 3 },
  technicianFeedbackPolicy: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderColor: "#CFE0F1", borderRadius: 15, backgroundColor: "#F7FBFF", padding: 13, marginTop: 15 },
  technicianFeedbackPolicyTitle: { color: palette.navy, fontSize: 11, fontWeight: "900" },
  technicianFeedbackPolicyText: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  ticketPaymentBody: { padding: 18, paddingBottom: 42 },
  ticketCheckoutHeader: { alignItems: "center", marginBottom: 16 },
  ticketPaymentEvent: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 15, borderWidth: 1, borderColor: "#DCE6F0", padding: 11, backgroundColor: "white" },
  ticketPaymentThumb: { width: 74, height: 58, borderRadius: 10 },
  ticketPaymentEventTitle: { color: palette.navy, fontSize: 13, fontWeight: "900" },
  ticketPaymentMeta: { color: palette.muted, fontSize: 9, marginTop: 3 },
  ticketOrderSummary: { marginTop: 13, borderRadius: 15, borderWidth: 1, borderColor: "#DCE6F0", padding: 13, backgroundColor: "#F8FBFE" },
  ticketOrderLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7 },
  ticketOrderLineText: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  ticketOrderLinePrice: { color: palette.navy, fontSize: 10, fontWeight: "900" },
  ticketOrderTotal: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 11, marginTop: 5 },
  ticketOrderTotalLabel: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  ticketOrderTotalValue: { color: palette.navy, fontSize: 19, fontWeight: "900" },
  ticketCompletePage: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  ticketCompleteIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: palette.green, alignItems: "center", justifyContent: "center" },
  ticketCompleteTitle: { color: palette.navy, fontSize: 24, fontWeight: "900", marginTop: 15 },
  ticketCompleteText: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "center", maxWidth: 360, marginTop: 7 },
  openGroupChatButton: { width: "100%", minHeight: 51, borderRadius: 13, backgroundColor: palette.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 19 },
  eventShareSheet: { padding: 18, paddingBottom: 40 },
  eventSharePreview: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 15, backgroundColor: "#F7FAFD", borderWidth: 1, borderColor: "#DEE7F0", padding: 10 },
  eventShareImage: { width: 72, height: 58, borderRadius: 10 },
  eventShareTitle: { color: palette.navy, fontSize: 13, fontWeight: "900" },
  eventShareMeta: { color: palette.muted, fontSize: 9, marginTop: 4 },
  eventShareLinkCard: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#D9E5F0", borderRadius: 13, padding: 7, marginTop: 12 },
  eventShareLinkCopy: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 5 },
  eventShareLinkText: { flex: 1, color: palette.muted, fontSize: 9 },
  eventShareCopyButton: { minHeight: 37, borderRadius: 10, backgroundColor: palette.blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 10 },
  eventShareCopyText: { color: "white", fontSize: 9, fontWeight: "900" },
  eventShareNativeButton: { minHeight: 48, borderRadius: 13, backgroundColor: palette.blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 10 },
  eventShareFriends: { gap: 7, marginTop: 8 },
  eventShareFriendRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: palette.line, paddingVertical: 7 },
  eventShareSendButton: { minWidth: 68, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: palette.blue },
  eventShareSentButton: { backgroundColor: "#E8F7EF" },
  eventShareSendText: { color: "white", fontSize: 9, fontWeight: "900" },
  eventShareSentText: { color: palette.green },
  eventViewTabs: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#EEF3F8",
    borderRadius: 14,
    padding: 4,
    marginTop: 14,
    marginBottom: 13,
  },
  eventViewTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  eventViewTabActive: { backgroundColor: palette.blue },
  eventViewTabText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  eventViewTabTextActive: { color: "white" },
  myEventsSubtitle: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
    maxWidth: 290,
  },
  myEventsSummary: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D9E7F2",
    backgroundColor: palette.sky,
    paddingVertical: 13,
    marginBottom: 13,
  },
  myEventsSummaryItem: { flex: 1, alignItems: "center" },
  myEventsSummaryValue: {
    color: palette.navy,
    fontSize: 19,
    fontWeight: "900",
  },
  myEventsSummaryLabel: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "800",
    marginTop: 3,
  },
  myEventManageCard: {
    borderWidth: 1,
    borderColor: "#DCE6F0",
    borderRadius: 18,
    backgroundColor: "white",
    padding: 13,
    shadowColor: "#17365E",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  myEventManageImage: { width: "100%", height: 155, borderRadius: 13 },
  myEventStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 11,
  },
  myEventLivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EAF8F0",
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  myEventLiveText: { color: "#28764C", fontSize: 8, fontWeight: "900" },
  myEventReference: { color: palette.muted, fontSize: 8, fontWeight: "800" },
  myEventManageTitle: {
    color: palette.navy,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 10,
  },
  myEventManageMeta: { color: palette.muted, fontSize: 9, marginTop: 4 },
  myEventProgressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E5EDF5",
    overflow: "hidden",
    marginTop: 14,
  },
  myEventProgressFill: {
    width: "24%",
    height: "100%",
    borderRadius: 4,
    backgroundColor: palette.green,
  },
  myEventCapacityLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  myEventCapacityText: { color: palette.muted, fontSize: 8, fontWeight: "800" },
  myEventActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  myEventSecondaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  myEventSecondaryActionText: {
    color: palette.blue,
    fontSize: 9,
    fontWeight: "900",
  },
  myEventPrimaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: palette.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  myEventPrimaryActionText: { color: "white", fontSize: 9, fontWeight: "900" },
  myEventChatLink: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    marginTop: 12,
    paddingTop: 10,
  },
  myEventChatLinkText: { flex: 1, color: palette.blue, fontSize: 9, fontWeight: "900" },
  cancelEventButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderTopWidth: 1, borderTopColor: "#F1D3D5", marginTop: 2, paddingTop: 10 },
  cancelEventButtonText: { color: palette.coral, fontSize: 9, fontWeight: "900" },
  cancelledEventNotice: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, backgroundColor: "#FFF4F5", padding: 10, marginTop: 11 },
  cancelledEventNoticeText: { flex: 1, color: "#8B4047", fontSize: 9, lineHeight: 14 },
  eventRefundCard: { borderWidth: 1, borderColor: "#CBE8D7", borderRadius: 14, backgroundColor: "#F2FBF6", padding: 11, marginTop: 10 },
  eventRefundHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  eventRefundIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  eventRefundTitle: { color: "#276B47", fontSize: 10, fontWeight: "900" },
  eventRefundMeta: { color: "#4D7A61", fontSize: 8, marginTop: 2 },
  eventRefundAmount: { color: palette.navy, fontSize: 15, fontWeight: "900" },
  eventRefundFacts: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#D5EADF", marginTop: 9, paddingTop: 8 },
  eventRefundFact: { color: "#4D7A61", fontSize: 8, fontWeight: "800" },
  myEventStateCard: { borderWidth: 1, borderColor: "#DCE6F0", borderRadius: 17, backgroundColor: "white", padding: 13, marginTop: 12 },
  myEventStateHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  myEventStateIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  myEventStateTitle: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  myEventStateMeta: { color: palette.muted, fontSize: 8, marginTop: 3 },
  myEventPendingPill: { borderRadius: 11, backgroundColor: "#FFF5D9", paddingVertical: 6, paddingHorizontal: 8 },
  myEventPendingText: { color: "#9A680D", fontSize: 7, fontWeight: "900" },
  myEventDeclinedPill: { borderRadius: 11, backgroundColor: "#FFF0F1", paddingVertical: 6, paddingHorizontal: 8 },
  myEventDeclinedText: { color: palette.coral, fontSize: 7, fontWeight: "900" },
  myEventReviewNotice: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, backgroundColor: "#FFFAEC", padding: 10, marginTop: 11 },
  myEventDeclinedNotice: { backgroundColor: "#FFF5F5" },
  myEventReviewText: { flex: 1, color: palette.muted, fontSize: 9, lineHeight: 14 },
  myEventStatusAction: { minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: palette.blue, alignItems: "center", justifyContent: "center", marginTop: 10 },
  myEventStatusActionText: { color: palette.blue, fontSize: 9, fontWeight: "900" },
  eventEditBody: { padding: 18, paddingBottom: 42 },
  eventEditAnnouncementNotice: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 14, backgroundColor: palette.sky, padding: 12, marginBottom: 4 },
  eventEditAnnouncementText: { flex: 1, color: palette.navy, fontSize: 9, lineHeight: 14 },
  organiserAnnouncement: { borderWidth: 1, borderColor: "#BBD9F5", borderRadius: 15, backgroundColor: "#F2F8FE", padding: 12, marginBottom: 10 },
  organiserAnnouncementHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  organiserAnnouncementIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.blue, alignItems: "center", justifyContent: "center" },
  organiserAnnouncementTitle: { color: palette.navy, fontSize: 10, fontWeight: "900" },
  organiserAnnouncementTime: { color: palette.muted, fontSize: 8, marginTop: 2 },
  organiserAnnouncementText: { color: palette.ink, fontSize: 10, lineHeight: 16, marginTop: 9 },
  organiserAnnouncementDelivery: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 9 },
  organiserAnnouncementDeliveryText: { color: palette.green, fontSize: 8, fontWeight: "800" },
  approvalNotificationNote: {
    width: "100%",
    maxWidth: 450,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: palette.sky,
    borderRadius: 14,
    padding: 12,
    marginTop: 13,
  },
  approvalNotificationText: {
    flex: 1,
    color: palette.navy,
    fontSize: 10,
    lineHeight: 15,
  },
  eventCapacityField: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 15,
    padding: 13,
    backgroundColor: "white",
  },
  eventCapacityHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eventCapacityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  eventCapacityHint: { color: palette.muted, fontSize: 9, marginTop: 3 },
  eventCapacityControl: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F6F9FC",
    borderRadius: 14,
    padding: 7,
    marginTop: 12,
  },
  eventCapacityButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#D3E2F0",
    alignItems: "center",
    justifyContent: "center",
  },
  eventCapacityValueWrap: { alignItems: "center" },
  eventCapacityValue: {
    color: palette.navy,
    fontSize: 23,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  eventCapacityUnit: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  eventCapacityPresets: { flexDirection: "row", gap: 7, marginTop: 9 },
  eventCapacityPreset: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6E1ED",
    alignItems: "center",
    justifyContent: "center",
  },
  eventCapacityPresetActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  eventCapacityPresetText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  eventCapacityPresetTextActive: { color: "white" },
  eventCapacityPolicy: { flexDirection: "row", alignItems: "flex-start", gap: 7, backgroundColor: palette.sky, borderRadius: 11, padding: 9, marginTop: 9 },
  eventCapacityPolicyText: { flex: 1, color: palette.navy, fontSize: 8, lineHeight: 13 },
  profileAudienceTabs: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#F0F4F8",
    borderRadius: 14,
    padding: 4,
    marginTop: 16,
  },
  profileAudienceTab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  profileAudienceTabActive: { backgroundColor: palette.blue },
  profileAudienceText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  profileAudienceTextActive: { color: "white" },
  profileSocialStats: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#DEE7F0",
    borderRadius: 15,
    backgroundColor: "white",
    marginTop: 12,
    overflow: "hidden",
  },
  profileSocialStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
  },
  profileSocialStatValue: {
    color: palette.navy,
    fontSize: 16,
    fontWeight: "900",
  },
  profileSocialStatLabel: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "800",
    marginTop: 3,
  },
  profileConnectionsCard: {
    borderWidth: 1,
    borderColor: "#CFE5D8",
    borderRadius: 15,
    backgroundColor: "#F4FBF7",
    padding: 13,
    marginTop: 10,
  },
  profileConnectionsHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  profileConnectionsTitle: {
    color: palette.navy,
    fontSize: 12,
    fontWeight: "900",
  },
  profileConnectionsText: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  profileConnectionFaces: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 11,
  },
  profileConnectionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "white",
  },
  profileConnectionNames: {
    color: palette.navy,
    fontSize: 9,
    fontWeight: "800",
    marginLeft: 9,
  },
  profileConnectionLink: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#D8EAE0",
    marginTop: 10,
    paddingTop: 9,
  },
  profileConnectionLinkText: {
    color: palette.blue,
    fontSize: 9,
    fontWeight: "900",
  },
  profileConnectionsLocked: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F3F6F9",
    borderRadius: 13,
    padding: 11,
    marginTop: 10,
  },
  profileConnectionsLockedText: {
    flex: 1,
    color: palette.muted,
    fontSize: 9,
    lineHeight: 14,
  },
  blockedPeopleBody: { padding: 18, paddingBottom: 40 },
  blockedPersonRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  unblockButton: {
    minHeight: 35,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.blue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  unblockButtonText: { color: palette.blue, fontSize: 9, fontWeight: "900" },
  settingsBody: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 54,
  },
  listingSummaryCard: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderRadius: 16,
    backgroundColor: palette.sky,
    padding: 16,
    marginBottom: 11,
  },
  listingSummaryValue: {
    color: palette.navy,
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },
  listingSummaryLabel: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 3,
  },
  profileListingRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  profileListingIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  profileListingPrice: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  settingsSectionLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 10,
  },
  settingsFirstSectionLabel: { marginTop: 2 },
  settingsCard: {
    borderWidth: 1,
    borderColor: "#DEE6EF",
    borderRadius: 18,
    backgroundColor: "white",
    overflow: "hidden",
    shadowColor: "#0A3266",
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  settingsRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  settingsIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: palette.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsRowTitle: { color: palette.navy, fontSize: 12, fontWeight: "900" },
  settingsRowText: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  settingsLanguageRow: { flexDirection: "row", gap: 9 },
  settingsLanguageButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#D9E3ED",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  settingsLanguageButtonActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  settingsLanguageText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  settingsLanguageTextActive: { color: "white" },
  settingsPrivacyLink: {
    minHeight: 132,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderWidth: 1,
    borderColor: "#BDD9F5",
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#F2F8FF",
  },
  settingsPrivacyIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B6FC8",
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  settingsPrivacyContent: { flex: 1 },
  settingsPrivacyTitle: {
    color: palette.navy,
    fontSize: 15,
    fontWeight: "900",
  },
  settingsPrivacyText: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  settingsPrivacyMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  settingsPrivacyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 12,
    backgroundColor: "#E3F1FF",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  settingsPrivacyBadgeText: {
    color: "#2878C8",
    fontSize: 8,
    fontWeight: "900",
  },
  settingsChevron: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsBlockedLink: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: "#E1E6EC",
    borderRadius: 17,
    paddingHorizontal: 14,
    backgroundColor: "white",
  },
  settingsBlockedIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFF1F2",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsBlockedCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFF1F2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  settingsBlockedCountText: {
    color: palette.coral,
    fontSize: 10,
    fontWeight: "900",
  },
  logoutButton: {
    minHeight: 56,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#BFD7ED",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  logoutButtonText: { color: palette.blue, fontSize: 12, fontWeight: "900" },
  dangerZone: {
    borderWidth: 1,
    borderColor: "#F3CDD0",
    borderRadius: 18,
    backgroundColor: "#FFF7F7",
    padding: 16,
    marginTop: 14,
  },
  dangerZoneTitle: { color: palette.coral, fontSize: 13, fontWeight: "900" },
  dangerZoneText: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  deleteAccountButton: {
    minHeight: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: palette.coral,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 13,
  },
  deleteAccountText: { color: palette.coral, fontSize: 11, fontWeight: "900" },
});
