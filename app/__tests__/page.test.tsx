import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "../(marketing)/page";

describe("Marketing Landing Page", () => {
  it("should render the page", () => {
    render(<Page />);
    const heading = screen.getByText(/Ship themes that convert/i);
    expect(heading).toBeDefined();
  });
});
