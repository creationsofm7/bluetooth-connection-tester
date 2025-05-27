import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("approach-one", "routes/approach-one.tsx"),
  route("approach-two", "routes/approach-two.tsx"),
  route("approach-three", "routes/approach-three.tsx"),
  route("approach-four", "routes/approach-four.tsx"),
  route("approach-five", "routes/approach-five.tsx"),
] satisfies RouteConfig;
