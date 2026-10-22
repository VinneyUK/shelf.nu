/**
 * The printer's status from its reports (fork): state, the slot in use, every
 * slot's filament (tagged or not) and health codes.
 */
import { describe, expect, it } from "vitest";
import { connectionProblem, statusInReport } from "./ams";

describe("statusInReport", () => {
  it("reads the state, the slot in use, the slots and health codes", () => {
    const out = statusInReport({
      print: {
        gcode_state: "RUNNING",
        hms: [{ attr: 0x07002000, code: 0x00020001 }],
        ams: {
          tray_now: "1",
          ams: [
            {
              tray: [
                {
                  id: "0",
                  tray_type: "PLA",
                  tray_sub_brands: "PLA Basic",
                  tray_color: "D62B2BFF",
                  remain: 96,
                },
                {
                  id: "1",
                  tray_type: "PETG",
                  tray_color: "8A8F98FF",
                  remain: -1,
                },
                { id: "2" },
                {
                  id: "3",
                  tray_type: "PLA",
                  tray_color: "161616FF",
                  remain: 45,
                },
              ],
            },
          ],
        },
      },
    });
    expect(out).toEqual({
      state: "printing",
      activeSlot: 2,
      slots: [
        {
          slot: 1,
          colourHex: "#D62B2B",
          type: "PLA Basic",
          remainingPercent: 96,
        },
        // no RFID: the colour and type, but no level
        { slot: 2, colourHex: "#8A8F98", type: "PETG", remainingPercent: null },
        { slot: 3, colourHex: null, type: null, remainingPercent: null },
        { slot: 4, colourHex: "#161616", type: "PLA", remainingPercent: 45 },
      ],
      hms: ["0700_2000_0002_0001"],
    });
  });

  it("leaves out what a report doesn't mention, so the last value stands", () => {
    // (how far through a print is now read too: see "the job's progress")
    expect(statusInReport({ print: { mc_print_stage: 2 } })).toEqual({});
    expect(statusInReport({ print: { gcode_state: "PAUSE" } })).toEqual({
      state: "paused",
    });
    expect(statusInReport(null)).toEqual({});
  });

  it("knows nothing loaded and the external spool aren't AMS slots", () => {
    expect(statusInReport({ print: { ams: { tray_now: "255" } } })).toEqual({
      activeSlot: null,
    });
    expect(statusInReport({ print: { ams: { tray_now: 254 } } })).toEqual({
      activeSlot: null,
    });
  });

  it("reads each state the printer sends", () => {
    const state = (g: string) =>
      statusInReport({ print: { gcode_state: g } }).state;
    expect(state("IDLE")).toBe("idle");
    expect(state("FINISH")).toBe("idle");
    expect(state("PREPARE")).toBe("printing");
    expect(state("FAILED")).toBe("error");
    expect(state("SOMETHING_NEW")).toBeUndefined();
  });
});

describe("connectionProblem", () => {
  it("tells a rejected access code from an unreachable printer", () => {
    expect(connectionProblem("Connection refused: Not authorized")).toBe(
      "auth"
    );
    expect(
      connectionProblem("Connection refused: Bad username or password")
    ).toBe("auth");
    expect(connectionProblem("connect ECONNREFUSED 192.168.0.119:8883")).toBe(
      "connection"
    );
    expect(connectionProblem("connect ETIMEDOUT 192.168.0.119:8883")).toBe(
      "connection"
    );
    expect(connectionProblem("Something else")).toBeNull();
    expect(connectionProblem(null)).toBeNull();
  });
});

describe("the job's progress (fork)", () => {
  it("reads the job's name, how far through, minutes left and layers", () => {
    expect(
      statusInReport({
        print: {
          subtask_name: "Desk organiser",
          mc_percent: 42,
          mc_remaining_time: 216,
          layer_num: 118,
          total_layer_num: 280,
        },
      })
    ).toEqual({
      jobName: "Desk organiser",
      percent: 42,
      minutesLeft: 216,
      layer: 118,
      layers: 280,
    });
  });
});
