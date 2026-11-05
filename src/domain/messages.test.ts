import { describe, expect, it } from "vitest";
import { inQuietHours, orderedParams, render, whenIn } from "./messages";

const opts = { timeZone: "Africa/Nairobi", baseUrl: "https://koobi.co.ke" };

describe("message rendering", () => {
  it("fills placeholders with formatted values and an absolute link", () => {
    const text = render("Koobi: {teacher} confirmed {title}, {when}. {amount}. {link}", {
      teacher: "Amina", title: "KCSE Chemistry", when: "2026-11-10T13:00:00Z", amount: 1800, link: "/bookings/x",
    }, opts);
    expect(text).toBe("Koobi: Amina confirmed KCSE Chemistry, Tue 10 Nov, 16:00 EAT. KES 1,800. https://koobi.co.ke/bookings/x");
  });
  it("names the zone for learners abroad", () => {
    expect(whenIn("2026-11-10T13:00:00Z", "Europe/London")).toBe("Tue 10 Nov, 13:00 Europe/London");
  });
  it("drops missing values instead of printing placeholders", () => {
    expect(render("Hello {teacher} {missing}.", { teacher: "Amina" }, opts)).toBe("Hello Amina .");
  });
  it("holds messages between 21:00 and 07:00 in the recipient's zone", () => {
    expect(inQuietHours(new Date("2026-11-10T19:30:00Z"), "Africa/Nairobi")).toBe(true); // 22:30 EAT
    expect(inQuietHours(new Date("2026-11-10T05:00:00Z"), "Africa/Nairobi")).toBe(false); // 08:00 EAT
  });
  it("orders WhatsApp parameters as they appear", () => {
    expect(orderedParams("{title} with {teacher}", { teacher: "Amina", title: "Maths" }, opts)).toEqual(["Maths", "Amina"]);
  });
});
