import { RouterProvider } from "@tanstack/react-router";
import { createRouter } from "./router";
import "./styles.css";

const router = createRouter();

export default function App() {
  return <RouterProvider router={router} />;
}
