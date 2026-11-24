import { redirect } from "next/navigation";

/**
 * Retired: the econ explainer now lives inside /town, so there is one product surface
 * instead of a brochure and a town saying the same thing differently.
 */
export default function How() {
  redirect("/town");
}
