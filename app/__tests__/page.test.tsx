import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "../page";

describe("Home Page", () => {
  it("should render the page", () => {
    render(<Page />);
    const heading = screen.getByText(/To get started/i);
    expect(heading).toBeDefined();
  });
});
