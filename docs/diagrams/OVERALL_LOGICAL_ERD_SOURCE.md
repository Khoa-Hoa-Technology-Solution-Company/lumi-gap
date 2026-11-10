# Overall Logical ERD - Source (draw.io XML)

Project: **LumiGap**. Notation: **Chen ERD**. Version: **1.0**. Code baseline: `main` a4b8c28.

## Files

| File | Content |
|---|---|
| `OVERALL_LOGICAL_ERD.drawio` | Editable diagram (uncompressed mxfile). Open it in diagrams.net or the draw.io desktop app. |
| `OVERALL_LOGICAL_ERD.xml` | The same mxfile with an XML declaration. Use it with Extras > Edit Diagram or File > Import. |
| `OVERALL_LOGICAL_ERD.png` | 11200 x 8000 px preview (2x scale). |
| `OVERALL_LOGICAL_ERD.pdf` | One A0 landscape vector page. Zoom in to read details. |
| `ENTITY_DICTIONARY.md` | Entity purpose, keys, attributes, every FK, and the relationship evidence. |

## How to import into draw.io

1. **Open the file.** Go to https://app.diagrams.net (or the desktop app), choose *File > Open from > Device*, and select `OVERALL_LOGICAL_ERD.drawio` or `OVERALL_LOGICAL_ERD.xml`.
2. **Or paste the XML.** Create a blank diagram, choose *Extras > Edit Diagram*, replace the content with the XML below, and press *OK*.
3. **Or import it.** Choose *File > Import from > Device* and select the `.xml` file. This adds the diagram to the current page.

Every entity, relationship, attribute and line is a separate native cell, so each one can be moved, restyled or deleted on its own. Lines are attached to their shapes (`source` and `target`), so they follow when a shape is moved.

## Structure of the XML

- `mxfile > diagram > mxGraphModel > root`, with cells `0` (root layer) and `1` (default layer).
- `zone_*`: rounded dashed rectangles, one per business domain (D1..D8). They are listed first, so they stay in the background.
- `hdr_*` and `lg*`: the header text and the legend.
- `E_<Entity>`: entity rectangles (`rounded=0`, fill `#DAE8FC`).
- `R<nn>`: relationship diamonds (`rhombus`, fill `#FFF2CC`). The label holds the verb, the cardinality and, for N:M, the join table in brackets.
- `A_<Entity>_<attribute>`: attribute ovals (`ellipse`, fill `#E2F0D9`). A PK oval uses `fontStyle=5` (bold + underline) and fill `#B9E0A5`. An FK oval is labelled `(FK)` and set in italics.
- `R<nn>_attr_<name>`: attributes of an N:M relationship (columns of the join table).
- `R<nn>_a` and `R<nn>_b`: lines from each entity to its diamond. The red label (`1`, `N`, `M`) is the cardinality next to the entity.
- `ae_*` and `R<nn>_ae_*`: thin green lines that attach attributes.

| Cell type | Count |
|---|---|
| header/legend/root | 16 |
| zone | 8 |
| relationship line | 126 |
| attribute line | 171 |
| entity | 39 |
| relationship | 63 |
| attribute | 171 |

## Full XML source (1828 lines)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="LumiGap documentation generator" version="24.7.17">
  <diagram id="overall-logical-erd" name="Overall Logical ERD (Chen)">
    <mxGraphModel dx="1600" dy="1000" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="5600" pageHeight="4000" background="#FFFFFF" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="zone_credit" value="D7  Credits &amp; Payments" style="rounded=1;arcSize=2;fillColor=#FFF9E6;strokeColor=#C9A227;dashed=1;strokeWidth=2;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontColor=#C9A227;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=22;movable=1;" vertex="1" parent="1">
          <mxGeometry x="40.0" y="260.0" width="1660.0" height="1140.0" as="geometry"/>
        </mxCell>
        <mxCell id="zone_analysis" value="D3  Research Analysis (AI)" style="rounded=1;arcSize=2;fillColor=#F7F1FB;strokeColor=#9673A6;dashed=1;strokeWidth=2;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontColor=#9673A6;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=22;movable=1;" vertex="1" parent="1">
          <mxGeometry x="1740.0" y="260.0" width="2120.0" height="1140.0" as="geometry"/>
        </mxCell>
        <mxCell id="zone_corpus" value="D2  Scholarly Corpus" style="rounded=1;arcSize=2;fillColor=#FDF5EC;strokeColor=#C77B30;dashed=1;strokeWidth=2;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontColor=#C77B30;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=22;movable=1;" vertex="1" parent="1">
          <mxGeometry x="3900.0" y="260.0" width="1660.0" height="1140.0" as="geometry"/>
        </mxCell>
        <mxCell id="zone_ops" value="D8  Notifications &amp; System Operations" style="rounded=1;arcSize=2;fillColor=#F4F4F4;strokeColor=#888888;dashed=1;strokeWidth=2;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontColor=#888888;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=22;movable=1;" vertex="1" parent="1">
          <mxGeometry x="40.0" y="1440.0" width="1660.0" height="1120.0" as="geometry"/>
        </mxCell>
        <mxCell id="zone_identity" value="D1  Identity &amp; Academic Verification" style="rounded=1;arcSize=2;fillColor=#EEF4FC;strokeColor=#5B7DB1;dashed=1;strokeWidth=2;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontColor=#5B7DB1;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=22;movable=1;" vertex="1" parent="1">
          <mxGeometry x="1740.0" y="1440.0" width="2120.0" height="1120.0" as="geometry"/>
        </mxCell>
        <mxCell id="zone_project" value="D4  Projects &amp; Collaboration" style="rounded=1;arcSize=2;fillColor=#EAF7F6;strokeColor=#3E9C94;dashed=1;strokeWidth=2;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontColor=#3E9C94;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=22;movable=1;" vertex="1" parent="1">
          <mxGeometry x="3900.0" y="1440.0" width="1660.0" height="2520.0" as="geometry"/>
        </mxCell>
        <mxCell id="zone_community" value="D6  Community &amp; Forum" style="rounded=1;arcSize=2;fillColor=#F1F7EA;strokeColor=#6A9C3E;dashed=1;strokeWidth=2;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontColor=#6A9C3E;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=22;movable=1;" vertex="1" parent="1">
          <mxGeometry x="40.0" y="2600.0" width="1660.0" height="1360.0" as="geometry"/>
        </mxCell>
        <mxCell id="zone_review" value="D5  Manuscript &amp; Peer Review" style="rounded=1;arcSize=2;fillColor=#FCEFEF;strokeColor=#B85450;dashed=1;strokeWidth=2;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontColor=#B85450;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=22;movable=1;" vertex="1" parent="1">
          <mxGeometry x="1740.0" y="2600.0" width="2120.0" height="1360.0" as="geometry"/>
        </mxCell>
        <mxCell id="legend_box" value="LEGEND" style="rounded=1;arcSize=4;fillColor=#FFFFFF;strokeColor=#666666;verticalAlign=top;align=left;spacingLeft=12;spacingTop=4;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=16;" vertex="1" parent="1">
          <mxGeometry x="3300.0" y="24.0" width="2240.0" height="208.0" as="geometry"/>
        </mxCell>
        <mxCell id="R00_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R00">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R00_b" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AcademicProfile" target="R00">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R01_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AcademicProfile" target="R01">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R01_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AcademicExternalIdentity" target="R01">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R02_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R02">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R02_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Affiliation" target="R02">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R03_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Institution" target="R03">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R03_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Affiliation" target="R03">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R04_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R04">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R04_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_VerificationEvidence" target="R04">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R05_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AcademicProfile" target="R05">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R05_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_VerificationEvidence" target="R05">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R06_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Author" target="R06">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R06_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R06">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R07_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Journal" target="R07">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R07_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R07">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R08_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R08">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R08_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchTopic" target="R08">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R09_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchTopic" target="R09">
          <mxGeometry x="-0.55" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="5180.0" y="1350.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R09_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchTopic" target="R09">
          <mxGeometry x="-0.55" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="5410.0" y="1140.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R10_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R10">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R10_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R10">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R11_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R11">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R11_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R11">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R12_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R12">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R12_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R12">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R13_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R13">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R13_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R13">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R14_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R14">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R14_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R14">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R15_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R15">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R15_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R15">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R16_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R16">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R16_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R16">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R17_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R17">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R17_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapValidation" target="R17">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R18_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R18">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R18_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapValidation" target="R18">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R19_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R19">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R19_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R19">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R20_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R20">
          <mxGeometry x="-0.55" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="760.0" y="1120.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R20_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R20">
          <mxGeometry x="-0.55" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="430.0" y="860.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R21_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R21">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R21_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R21">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R22_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R22">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R22_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R22">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R23_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R23">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R23_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_PaymentOrder" target="R23">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R24_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R24">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R24_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Notification" target="R24">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R25_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R25">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R25_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AuditLog" target="R25">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R26_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R26">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R26_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_UserAiConnection" target="R26">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R27_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R27">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R27_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R27">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R28_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R28">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R28_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R28">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R29_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R29">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R29_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R29">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R30_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R30">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R30_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R30">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R31_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R31">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R31_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R31">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R32_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R32">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R32_b" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchPlan" target="R32">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R33_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R33">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R33_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ProjectTask" target="R33">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R34_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R34">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R34_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorshipRequest" target="R34">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R35_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R35">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R35_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorshipRequest" target="R35">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R36_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorshipRequest" target="R36">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R36_b" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorRelationship" target="R36">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R37_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R37">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R37_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorRelationship" target="R37">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R38_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R38">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R38_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_RecruitmentOpening" target="R38">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R39_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_RecruitmentOpening" target="R39">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R39_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_RecruitmentApplication" target="R39">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R40_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R40">
          <mxGeometry x="-0.7" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="3880.0" y="2520.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R40_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_RecruitmentApplication" target="R40">
          <mxGeometry x="-0.7" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="3880.0" y="3800.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R41_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R41">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R41_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_DraftWorkspace" target="R41">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R42_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R42">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R42_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R42">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R43_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R43">
          <mxGeometry x="-0.7" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1720.0" y="470.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R43_b" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R43">
          <mxGeometry x="-0.7" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1720.0" y="2980.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R44_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R44">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R44_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_SubmissionRevision" target="R44">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R45_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R45">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R45_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AiPreReview" target="R45">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R46_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R46">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R46_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewRequest" target="R46">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R47_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_SubmissionRevision" target="R47">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R47_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewRequest" target="R47">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R48_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewRequest" target="R48">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R48_b" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewerAssignment" target="R48">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R49_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R49">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R49_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewerAssignment" target="R49">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R50_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewerAssignment" target="R50">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R50_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_HumanReview" target="R50">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R51_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewTemplate" target="R51">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R51_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewTemplateVersion" target="R51">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R52_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewTemplateVersion" target="R52">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R52_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewRequest" target="R52">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R53_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R53">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R53_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Community" target="R53">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R54_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Community" target="R54">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R54_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R54">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R55_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R55">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R55_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R55">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R56_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R56">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R56_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R56">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R57_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R57">
          <mxGeometry x="-0.55" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1300.0" y="3830.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R57_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R57">
          <mxGeometry x="-0.55" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1600.0" y="3600.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R58_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R58">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R58_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R58">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R59_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R59">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R59_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ContentReport" target="R59">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R60_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R60">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R60_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ContentReport" target="R60">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R61_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R61">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R61_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ContentReport" target="R61">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R62_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R62">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R62_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R62">
          <mxGeometry x="-0.7" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_User_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_User" target="A_User_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_User_email" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_User" target="A_User_email">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_User_systemRole" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_User" target="A_User_systemRole">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_User_accountStatus" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_User" target="A_User_accountStatus">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AcademicProfile_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AcademicProfile" target="A_AcademicProfile_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AcademicProfile_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AcademicProfile" target="A_AcademicProfile_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AcademicProfile_publicHandle" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AcademicProfile" target="A_AcademicProfile_publicHandle">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AcademicProfile_primaryPosition" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AcademicProfile" target="A_AcademicProfile_primaryPosition">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AcademicExternalIdentity_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AcademicExternalIdentity" target="A_AcademicExternalIdentity_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AcademicExternalIdentity_profileId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AcademicExternalIdentity" target="A_AcademicExternalIdentity_profileId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AcademicExternalIdentity_provider" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AcademicExternalIdentity" target="A_AcademicExternalIdentity_provider">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AcademicExternalIdentity_externalId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AcademicExternalIdentity" target="A_AcademicExternalIdentity_externalId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Affiliation_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Affiliation" target="A_Affiliation_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Affiliation_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Affiliation" target="A_Affiliation_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Affiliation_institutionId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Affiliation" target="A_Affiliation_institutionId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Affiliation_verificationStatus" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Affiliation" target="A_Affiliation_verificationStatus">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Institution_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Institution" target="A_Institution_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Institution_name" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Institution" target="A_Institution_name">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Institution_rorId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Institution" target="A_Institution_rorId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_VerificationEvidence_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_VerificationEvidence" target="A_VerificationEvidence_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_VerificationEvidence_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_VerificationEvidence" target="A_VerificationEvidence_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_VerificationEvidence_verificationType" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_VerificationEvidence" target="A_VerificationEvidence_verificationType">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_VerificationEvidence_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_VerificationEvidence" target="A_VerificationEvidence_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Paper_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Paper" target="A_Paper_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Paper_doi" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Paper" target="A_Paper_doi">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Paper_title" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Paper" target="A_Paper_title">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Paper_publicationYear" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Paper" target="A_Paper_publicationYear">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Paper_journalId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Paper" target="A_Paper_journalId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Author_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Author" target="A_Author_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Author_orcid" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Author" target="A_Author_orcid">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Author_displayName" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Author" target="A_Author_displayName">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Author_hIndex" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Author" target="A_Author_hIndex">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Journal_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Journal" target="A_Journal_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Journal_name" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Journal" target="A_Journal_name">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Journal_publisher" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Journal" target="A_Journal_publisher">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchTopic_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchTopic" target="A_ResearchTopic_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchTopic_topicName" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchTopic" target="A_ResearchTopic_topicName">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchTopic_level" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchTopic" target="A_ResearchTopic_level">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchTopic_parentTopicId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchTopic" target="A_ResearchTopic_parentTopicId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Report_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Report" target="A_Report_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Report_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Report" target="A_Report_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Report_query" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Report" target="A_Report_query">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Report_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Report" target="A_Report_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Report_creditCost" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Report" target="A_Report_creditCost">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_GapAnalysis_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_GapAnalysis" target="A_GapAnalysis_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_GapAnalysis_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_GapAnalysis" target="A_GapAnalysis_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_GapAnalysis_topic" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_GapAnalysis" target="A_GapAnalysis_topic">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_GapAnalysis_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_GapAnalysis" target="A_GapAnalysis_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_GapAnalysis_creditCost" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_GapAnalysis" target="A_GapAnalysis_creditCost">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchGap_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchGap" target="A_ResearchGap_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchGap_analysisId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchGap" target="A_ResearchGap_analysisId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchGap_title" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchGap" target="A_ResearchGap_title">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchGap_gapType" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchGap" target="A_ResearchGap_gapType">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchGap_validationStatus" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchGap" target="A_ResearchGap_validationStatus">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_GapValidation_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_GapValidation" target="A_GapValidation_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_GapValidation_gapId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_GapValidation" target="A_GapValidation_gapId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_GapValidation_reviewerId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_GapValidation" target="A_GapValidation_reviewerId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_GapValidation_action" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_GapValidation" target="A_GapValidation_action">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Project_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Project" target="A_Project_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Project_ownerId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Project" target="A_Project_ownerId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Project_title" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Project" target="A_Project_title">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Project_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Project" target="A_Project_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchPlan_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchPlan" target="A_ResearchPlan_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchPlan_projectId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchPlan" target="A_ResearchPlan_projectId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchPlan_problem" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchPlan" target="A_ResearchPlan_problem">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ResearchPlan_version" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ResearchPlan" target="A_ResearchPlan_version">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ProjectTask_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ProjectTask" target="A_ProjectTask_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ProjectTask_projectId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ProjectTask" target="A_ProjectTask_projectId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ProjectTask_title" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ProjectTask" target="A_ProjectTask_title">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ProjectTask_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ProjectTask" target="A_ProjectTask_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_MentorshipRequest_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_MentorshipRequest" target="A_MentorshipRequest_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_MentorshipRequest_projectId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_MentorshipRequest" target="A_MentorshipRequest_projectId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_MentorshipRequest_mentorUserId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_MentorshipRequest" target="A_MentorshipRequest_mentorUserId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_MentorshipRequest_mentorRole" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_MentorshipRequest" target="A_MentorshipRequest_mentorRole">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_MentorshipRequest_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_MentorshipRequest" target="A_MentorshipRequest_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_MentorRelationship_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_MentorRelationship" target="A_MentorRelationship_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_MentorRelationship_sourceRequestId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_MentorRelationship" target="A_MentorRelationship_sourceRequestId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_MentorRelationship_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_MentorRelationship" target="A_MentorRelationship_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_RecruitmentOpening_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_RecruitmentOpening" target="A_RecruitmentOpening_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_RecruitmentOpening_projectId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_RecruitmentOpening" target="A_RecruitmentOpening_projectId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_RecruitmentOpening_title" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_RecruitmentOpening" target="A_RecruitmentOpening_title">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_RecruitmentOpening_capacity" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_RecruitmentOpening" target="A_RecruitmentOpening_capacity">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_RecruitmentApplication_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_RecruitmentApplication" target="A_RecruitmentApplication_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_RecruitmentApplication_openingId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_RecruitmentApplication" target="A_RecruitmentApplication_openingId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_RecruitmentApplication_applicantId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_RecruitmentApplication" target="A_RecruitmentApplication_applicantId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_RecruitmentApplication_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_RecruitmentApplication" target="A_RecruitmentApplication_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_DraftWorkspace_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_DraftWorkspace" target="A_DraftWorkspace_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_DraftWorkspace_projectId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_DraftWorkspace" target="A_DraftWorkspace_projectId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_DraftWorkspace_name" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_DraftWorkspace" target="A_DraftWorkspace_name">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_DraftWorkspace_writingMode" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_DraftWorkspace" target="A_DraftWorkspace_writingMode">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Submission_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Submission" target="A_Submission_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Submission_projectId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Submission" target="A_Submission_projectId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Submission_sourceReportId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Submission" target="A_Submission_sourceReportId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Submission_title" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Submission" target="A_Submission_title">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Submission_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Submission" target="A_Submission_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_SubmissionRevision_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_SubmissionRevision" target="A_SubmissionRevision_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_SubmissionRevision_submissionId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_SubmissionRevision" target="A_SubmissionRevision_submissionId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_SubmissionRevision_revisionNumber" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_SubmissionRevision" target="A_SubmissionRevision_revisionNumber">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AiPreReview_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AiPreReview" target="A_AiPreReview_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AiPreReview_submissionId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AiPreReview" target="A_AiPreReview_submissionId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AiPreReview_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AiPreReview" target="A_AiPreReview_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewRequest_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewRequest" target="A_ReviewRequest_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewRequest_submissionId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewRequest" target="A_ReviewRequest_submissionId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewRequest_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewRequest" target="A_ReviewRequest_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewRequest_expiresAt" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewRequest" target="A_ReviewRequest_expiresAt">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewerAssignment_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewerAssignment" target="A_ReviewerAssignment_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewerAssignment_reviewRequestId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewerAssignment" target="A_ReviewerAssignment_reviewRequestId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewerAssignment_reviewerId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewerAssignment" target="A_ReviewerAssignment_reviewerId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewerAssignment_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewerAssignment" target="A_ReviewerAssignment_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_HumanReview_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_HumanReview" target="A_HumanReview_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_HumanReview_assignmentId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_HumanReview" target="A_HumanReview_assignmentId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_HumanReview_roundNumber" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_HumanReview" target="A_HumanReview_roundNumber">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_HumanReview_recommendation" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_HumanReview" target="A_HumanReview_recommendation">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewTemplate_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewTemplate" target="A_ReviewTemplate_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewTemplate_name" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewTemplate" target="A_ReviewTemplate_name">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewTemplate_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewTemplate" target="A_ReviewTemplate_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewTemplateVersion_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewTemplateVersion" target="A_ReviewTemplateVersion_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewTemplateVersion_templateId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewTemplateVersion" target="A_ReviewTemplateVersion_templateId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ReviewTemplateVersion_versionNumber" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ReviewTemplateVersion" target="A_ReviewTemplateVersion_versionNumber">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Community_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Community" target="A_Community_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Community_name" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Community" target="A_Community_name">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Community_visibility" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Community" target="A_Community_visibility">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Community_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Community" target="A_Community_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ForumPost_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ForumPost" target="A_ForumPost_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ForumPost_authorId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ForumPost" target="A_ForumPost_authorId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ForumPost_communityId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ForumPost" target="A_ForumPost_communityId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ForumPost_title" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ForumPost" target="A_ForumPost_title">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ForumPost_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ForumPost" target="A_ForumPost_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ForumComment_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ForumComment" target="A_ForumComment_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ForumComment_postId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ForumComment" target="A_ForumComment_postId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ForumComment_parentCommentId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ForumComment" target="A_ForumComment_parentCommentId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ForumComment_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ForumComment" target="A_ForumComment_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ContentReport_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ContentReport" target="A_ContentReport_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ContentReport_reporterId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ContentReport" target="A_ContentReport_reporterId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ContentReport_reason" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ContentReport" target="A_ContentReport_reason">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_ContentReport_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_ContentReport" target="A_ContentReport_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_CreditTransaction_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_CreditTransaction" target="A_CreditTransaction_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_CreditTransaction_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_CreditTransaction" target="A_CreditTransaction_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_CreditTransaction_action" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_CreditTransaction" target="A_CreditTransaction_action">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_CreditTransaction_amount" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_CreditTransaction" target="A_CreditTransaction_amount">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_CreditTransaction_idempotencyKey" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_CreditTransaction" target="A_CreditTransaction_idempotencyKey">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_CreditTransaction_refundedTransactionId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_CreditTransaction" target="A_CreditTransaction_refundedTransactionId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaymentOrder_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaymentOrder" target="A_PaymentOrder_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaymentOrder_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaymentOrder" target="A_PaymentOrder_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaymentOrder_orderCode" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaymentOrder" target="A_PaymentOrder_orderCode">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaymentOrder_amount" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaymentOrder" target="A_PaymentOrder_amount">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaymentOrder_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaymentOrder" target="A_PaymentOrder_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Notification_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Notification" target="A_Notification_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Notification_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Notification" target="A_Notification_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Notification_type" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Notification" target="A_Notification_type">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_Notification_isRead" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_Notification" target="A_Notification_isRead">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AuditLog_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AuditLog" target="A_AuditLog_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AuditLog_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AuditLog" target="A_AuditLog_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_AuditLog_actionName" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_AuditLog" target="A_AuditLog_actionName">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_UserAiConnection_id" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_UserAiConnection" target="A_UserAiConnection_id">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_UserAiConnection_userId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_UserAiConnection" target="A_UserAiConnection_userId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_UserAiConnection_provider" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_UserAiConnection" target="A_UserAiConnection_provider">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R06_ae_position" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R06" target="R06_attr_position">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R06_ae_isCorresponding" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R06" target="R06_attr_isCorresponding">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R08_ae_confidence" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R08" target="R08_attr_confidence">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R08_ae_isPrimary" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R08" target="R08_attr_isPrimary">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R11_ae_kind" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R11" target="R11_attr_kind">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R11_ae_position" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R11" target="R11_attr_position">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R13_ae_position" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R13" target="R13_attr_position">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R16_ae_kind" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R16" target="R16_attr_kind">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R28_ae_role" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R28" target="R28_attr_role">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R28_ae_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R28" target="R28_attr_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R29_ae_screeningStatus" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R29" target="R29_attr_screeningStatus">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R29_ae_readingStatus" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R29" target="R29_attr_readingStatus">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R53_ae_role" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R53" target="R53_attr_role">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R53_ae_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R53" target="R53_attr_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="hdr_title" value="OVERALL LOGICAL ENTITY RELATIONSHIP DIAGRAM" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=40;" vertex="1" parent="1">
          <mxGeometry x="100.0" y="52.0" width="2800.0" height="56.0" as="geometry"/>
        </mxCell>
        <mxCell id="hdr_meta" value="PROJECT: LumiGap - An Intelligent Research Gap Discovery and Academic Collaboration Platform&lt;br&gt;NOTATION: CHEN ERD     VERSION: 1.0     SOURCE: Prisma schema + SQL migrations, main a4b8c28 (39 entities, 8 domains)" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=18;" vertex="1" parent="1">
          <mxGeometry x="100.0" y="125.0" width="2800.0" height="90.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg0" value="Entity" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="3410.0" y="84.0" width="120.0" height="40.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt0" value="Rectangle = Entity" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3320.0" y="144.0" width="300.0" height="24.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg1" value="relation&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3850.0" y="75.0" width="120.0" height="58.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt1" value="Diamond = Relationship" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3760.0" y="144.0" width="300.0" height="24.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg2" value="attribute" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4295.0" y="87.0" width="110.0" height="34.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt2" value="Oval = Attribute" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4200.0" y="144.0" width="300.0" height="24.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg3" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4745.0" y="87.0" width="90.0" height="34.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt3" value="Underlined = Primary Key" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4640.0" y="144.0" width="300.0" height="24.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg4" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5165.0" y="87.0" width="130.0" height="34.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt4" value="(FK) = Foreign Key" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="5080.0" y="144.0" width="300.0" height="24.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg_card" value="Cardinality (red, on each line next to an entity): 1:1 = One-to-One   1:N = One-to-Many   N:M = Many-to-Many&lt;br&gt;N:M relationships are implemented by the join table named under the diamond; their attributes hang off the diamond" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3320.0" y="184.0" width="2200.0" height="40.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_User" value="User" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2720.0" y="2024.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_AcademicProfile" value="AcademicProfile" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2720.0" y="1664.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_AcademicExternalIdentity" value="AcademicExternalIdentity" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3152.5" y="1514.0" width="215.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Affiliation" value="Affiliation" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3250.0" y="1834.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Institution" value="Institution" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3580.0" y="1614.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_VerificationEvidence" value="VerificationEvidence" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3510.0" y="2234.0" width="180.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Paper" value="Paper" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="4300.0" y="924.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Author" value="Author" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="5100.0" y="534.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Journal" value="Journal" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="4100.0" y="1264.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ResearchTopic" value="ResearchTopic" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="5100.0" y="1114.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Report" value="Report" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2070.0" y="444.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_GapAnalysis" value="GapAnalysis" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3270.0" y="534.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ResearchGap" value="ResearchGap" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2720.0" y="1054.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_GapValidation" value="GapValidation" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2000.0" y="1154.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Project" value="Project" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="4480.0" y="2004.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ResearchPlan" value="ResearchPlan" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="5170.0" y="1734.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ProjectTask" value="ProjectTask" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="5170.0" y="2324.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_MentorshipRequest" value="MentorshipRequest" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="4163.0" y="2794.0" width="174.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_MentorRelationship" value="MentorRelationship" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="4413.0" y="3514.0" width="174.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_RecruitmentOpening" value="RecruitmentOpening" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="5059.0" y="2874.0" width="182.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_RecruitmentApplication" value="RecruitmentApplication" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="5049.0" y="3674.0" width="202.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_DraftWorkspace" value="DraftWorkspace" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3440.0" y="2774.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Submission" value="Submission" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2370.0" y="2954.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_SubmissionRevision" value="SubmissionRevision" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3310.0" y="3274.0" width="180.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_AiPreReview" value="AiPreReview" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2620.0" y="2734.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ReviewRequest" value="ReviewRequest" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2770.0" y="3454.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ReviewerAssignment" value="ReviewerAssignment" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="1957.5" y="3304.0" width="185.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_HumanReview" value="HumanReview" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="1970.0" y="3794.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ReviewTemplate" value="ReviewTemplate" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3400.0" y="3764.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ReviewTemplateVersion" value="ReviewTemplateVersion" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2777.5" y="3764.0" width="205.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Community" value="Community" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="340.0" y="2874.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ForumPost" value="ForumPost" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="1070.0" y="2954.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ForumComment" value="ForumComment" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="1220.0" y="3574.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ContentReport" value="ContentReport" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="470.0" y="3574.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_CreditTransaction" value="CreditTransaction" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="679.0" y="834.0" width="162.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_PaymentOrder" value="PaymentOrder" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="1220.0" y="1224.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Notification" value="Notification" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="520.0" y="1694.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_AuditLog" value="AuditLog" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="520.0" y="2224.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_UserAiConnection" value="UserAiConnection" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="1267.5" y="2304.0" width="165.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="R00" value="has profile&lt;br&gt;(1:1)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2740.0" y="1837.0" width="120.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R01" value="links identity&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2963.0" y="1582.0" width="134.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R02" value="holds&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2926.5" y="1950.5" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R03" value="is affiliated at&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3426.5" y="1717.0" width="137.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R04" value="submits evidence&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3278.5" y="2164.0" width="163.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R05" value="supports&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3141.0" y="1942.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R06" value="writes&lt;br&gt;(N:M)&lt;br&gt;[PaperAuthor]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4704.5" y="709.0" width="151.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R07" value="publishes&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4221.0" y="1087.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R08" value="classified under&lt;br&gt;(N:M)&lt;br&gt;[PaperTopic]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4690.5" y="999.0" width="179.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R09" value="is parent of&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="5348.0" y="1317.0" width="124.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R10" value="requests report&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2531.0" y="1543.0" width="148.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R11" value="cites&lt;br&gt;(N:M)&lt;br&gt;[ReportPaper]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3010.6" y="625.6" width="152.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R12" value="runs analysis&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3006.5" y="1272.0" width="137.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R13" value="analyzes&lt;br&gt;(N:M)&lt;br&gt;[GapAnalysisPaper]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3774.5" y="709.0" width="181.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R14" value="produces&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3016.0" y="787.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R15" value="suggests&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2416.0" y="742.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R16" value="grounded in&lt;br&gt;(N:M)&lt;br&gt;[ResearchGapPaper]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3496.0" y="969.0" width="188.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R17" value="receives vote&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2228.5" y="1117.0" width="135.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R18" value="validates&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2381.0" y="1582.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R19" value="has ledger entry&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1458.2" y="1279.2" width="154.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R20" value="refunds&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="371.0" y="1087.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R21" value="charges report&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1383.0" y="632.0" width="144.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R22" value="charges analysis&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1976.0" y="677.0" width="158.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R23" value="places order&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1984.5" y="1617.0" width="131.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R24" value="receives&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1377.0" y="1812.4" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R25" value="performs&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1377.0" y="2141.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R26" value="configures&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1870.0" y="2185.0" width="120.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R27" value="owns&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3621.0" y="2007.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R28" value="is member of&lt;br&gt;(N:M)&lt;br&gt;[ProjectMember]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3708.0" y="2124.0" width="164.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R29" value="collects&lt;br&gt;(N:M)&lt;br&gt;[ProjectPaper]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4393.5" y="1444.0" width="153.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R30" value="scopes report&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3285.5" y="1217.0" width="139.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R31" value="scopes analysis&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3878.5" y="1262.0" width="153.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R32" value="has plan&lt;br&gt;(1:1)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4846.0" y="1862.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R33" value="contains&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4846.0" y="2157.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R34" value="requests mentor&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4327.5" y="2392.0" width="155.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R35" value="is invited as mentor&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3654.0" y="2517.5" width="177.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R36" value="becomes&lt;br&gt;(1:1)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4316.0" y="3147.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R37" value="is mentored in&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4458.0" y="2752.0" width="144.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R38" value="opens&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4796.0" y="2432.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R39" value="receives application&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="5061.0" y="3267.0" width="178.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R40" value="applies&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3821.0" y="3187.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R41" value="drafts in&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3981.0" y="2382.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R42" value="submits&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3762.5" y="2329.5" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R43" value="is submitted as&lt;br&gt;(1:1)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1645.5" y="2017.0" width="149.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R44" value="has revision&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2860.0" y="3107.0" width="130.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R45" value="is pre-reviewed by&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2491.5" y="2837.0" width="167.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R46" value="requests review&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2574.5" y="3197.0" width="151.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R47" value="is reviewed in&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3055.0" y="3357.0" width="140.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R48" value="assigns&lt;br&gt;(1:1)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2391.0" y="3372.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R49" value="reviews as&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2365.5" y="2657.0" width="119.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R50" value="produces round&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1973.5" y="3542.0" width="153.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R51" value="has version&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3117.0" y="3757.0" width="126.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R52" value="is used by&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2806.0" y="3602.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R53" value="joins&lt;br&gt;(N:M)&lt;br&gt;[CommunityMembership]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1864.5" y="2301.5" width="205.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R54" value="hosts&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="726.0" y="2907.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R55" value="authors post&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1909.0" y="2482.0" width="132.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R56" value="has comment&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1156.0" y="3257.0" width="138.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R57" value="replies to&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1541.0" y="3797.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R58" value="writes comment&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1973.5" y="2792.0" width="153.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R59" value="is reported in&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="781.5" y="3257.0" width="137.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R60" value="flags comment&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="852.0" y="3567.0" width="146.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R61" value="files report&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1344.5" y="2978.0" width="121.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R62" value="discusses gap&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1903.5" y="1997.0" width="143.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_User_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2965.0" y="2409.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_User_email" value="email" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2665.0" y="2294.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_User_systemRole" value="systemRole" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2905.0" y="2174.0" width="90.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_User_accountStatus" value="accountStatus" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2798.5" y="2314.0" width="103.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicProfile_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3075.9" y="1687.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicProfile_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3063.4" y="1726.9" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicProfile_publicHandle" value="publicHandle" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3041.3" y="1764.9" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicProfile_primaryPosition" value="primaryPosition" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3009.5" y="1800.0" width="111.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicExternalIdentity_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3377.4" y="1544.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicExternalIdentity_profileId" value="profileId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3266.1" y="1624.1" width="96.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicExternalIdentity_provider" value="provider" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3137.5" y="1611.2" width="71.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicExternalIdentity_externalId" value="externalId" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3062.3" y="1517.6" width="80.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Affiliation_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3330.0" y="1739.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Affiliation_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3430.5" y="1799.5" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Affiliation_institutionId" value="institutionId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3418.8" y="1892.7" width="114.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Affiliation_verificationStatus" value="verificationStatus" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3299.9" y="1949.4" width="119.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Institution_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3514.8" y="1577.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Institution_name" value="name" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3732.0" y="1574.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Institution_rorId" value="rorId" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3642.6" y="1711.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_VerificationEvidence_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3696.5" y="2243.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_VerificationEvidence_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3624.7" y="2318.9" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_VerificationEvidence_verificationType" value="verificationType" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3491.0" y="2324.7" width="112.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_VerificationEvidence_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3434.8" y="2255.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4157.7" y="814.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_doi" value="doi" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4239.3" y="769.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4334.2" y="751.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_publicationYear" value="publicationYear" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4410.2" y="763.3" width="112.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_journalId" value="journalId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4504.7" y="802.7" width="100.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Author_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5045.9" y="488.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Author_orcid" value="orcid" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5197.7" y="463.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Author_displayName" value="displayName" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5265.7" y="563.0" width="98.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Author_hIndex" value="hIndex" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5147.0" y="632.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Journal_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4263.9" y="1281.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Journal_name" value="name" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4088.8" y="1342.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Journal_publisher" value="publisher" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4077.5" y="1208.5" width="77.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchTopic_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5017.5" y="1064.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchTopic_topicName" value="topicName" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5101.8" y="1019.8" width="85.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchTopic_level" value="level" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5213.1" y="1028.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchTopic_parentTopicId" value="parentTopicId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5274.2" y="1087.2" width="127.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1981.1" y="420.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2034.3" y="370.6" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_query" value="query" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2128.5" y="356.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2211.2" y="383.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_creditCost" value="creditCost" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2254.2" y="440.6" width="81.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3187.5" y="523.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3235.0" y="471.0" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_topic" value="topic" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3329.3" y="455.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3410.8" y="485.5" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_creditCost" value="creditCost" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3443.7" y="545.1" width="81.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3053.3" y="1122.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_analysisId" value="analysisId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2981.0" y="1203.1" width="107.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2896.0" y="1260.2" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_gapType" value="gapType" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2777.5" y="1283.7" width="74.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_validationStatus" value="validationStatus" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2639.0" y="1269.4" width="113.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapValidation_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2052.5" y="1252.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapValidation_gapId" value="gapId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1910.6" y="1190.1" width="83.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapValidation_reviewerId" value="reviewerId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1960.8" y="1087.3" width="109.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapValidation_action" value="action" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2136.5" y="1102.5" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Project_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4540.0" y="1874.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Project_ownerId" value="ownerId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4697.0" y="1889.0" width="96.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Project_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4620.0" y="1804.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Project_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4740.0" y="1809.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchPlan_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5123.3" y="1682.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchPlan_projectId" value="projectId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5264.3" y="1667.2" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchPlan_problem" value="problem" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5339.8" y="1769.9" width="71.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchPlan_version" value="version" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5207.7" y="1832.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ProjectTask_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5214.8" y="2245.1" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ProjectTask_projectId" value="projectId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5334.8" y="2313.3" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ProjectTask_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5269.9" y="2413.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ProjectTask_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5117.6" y="2391.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_MentorshipRequest_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4211.9" y="2967.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_MentorshipRequest_projectId" value="projectId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4106.9" y="2952.3" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_MentorshipRequest_mentorUserId" value="mentorUserId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4009.4" y="2910.6" width="126.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_MentorshipRequest_mentorRole" value="mentorRole" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3982.7" y="2850.0" width="90.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_MentorshipRequest_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3989.9" y="2781.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_MentorRelationship_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4572.3" y="3475.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_MentorRelationship_sourceRequestId" value="sourceRequestId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4445.0" y="3612.0" width="145.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_MentorRelationship_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4339.7" y="3498.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentOpening_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5068.5" y="2743.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentOpening_projectId" value="projectId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5241.4" y="2779.5" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentOpening_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5313.7" y="2914.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentOpening_capacity" value="capacity" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5180.2" y="3020.3" width="71.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentApplication_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5164.2" y="3582.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentApplication_openingId" value="openingId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5260.5" y="3693.7" width="107.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentApplication_applicantId" value="applicantId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5118.0" y="3790.1" width="112.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentApplication_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4974.9" y="3728.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_DraftWorkspace_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3609.3" y="2830.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_DraftWorkspace_projectId" value="projectId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3435.9" y="2878.9" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_DraftWorkspace_name" value="name" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3341.6" y="2780.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_DraftWorkspace_writingMode" value="writingMode" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3447.4" y="2687.7" width="93.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2134.2" y="3007.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_projectId" value="projectId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2107.8" y="2940.3" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_sourceReportId" value="sourceReportId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2109.3" y="2875.1" width="136.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2209.8" y="2819.2" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2284.2" y="2778.1" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_SubmissionRevision_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3309.2" y="3194.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_SubmissionRevision_submissionId" value="submissionId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3495.0" y="3284.4" width="124.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_SubmissionRevision_revisionNumber" value="revisionNumber" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3284.6" y="3372.9" width="113.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AiPreReview_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2501.9" y="2693.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AiPreReview_submissionId" value="submissionId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2777.1" y="2660.5" width="124.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AiPreReview_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2712.0" y="2865.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewRequest_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2788.6" y="3310.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewRequest_submissionId" value="submissionId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2865.8" y="3320.6" width="124.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewRequest_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2979.9" y="3367.2" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewRequest_expiresAt" value="expiresAt" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3025.6" y="3438.8" width="77.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewerAssignment_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1953.4" y="3441.5" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewerAssignment_reviewRequestId" value="reviewRequestId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1774.5" y="3345.0" width="144.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewerAssignment_reviewerId" value="reviewerId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1855.1" y="3220.4" width="109.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewerAssignment_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2046.9" y="3180.5" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_HumanReview_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2154.4" y="3758.5" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_HumanReview_assignmentId" value="assignmentId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2085.1" y="3888.4" width="125.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_HumanReview_roundNumber" value="roundNumber" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1903.6" y="3888.4" width="102.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_HumanReview_recommendation" value="recommendation" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1841.7" y="3758.5" width="118.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplate_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3398.8" y="3701.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplate_name" value="name" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3564.5" y="3774.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplate_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3398.8" y="3846.1" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplateVersion_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2921.0" y="3833.2" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplateVersion_templateId" value="templateId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2744.6" y="3832.9" width="109.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplateVersion_versionNumber" value="versionNumber" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2725.1" y="3726.8" width="110.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Community_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="449.7" y="2959.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Community_name" value="name" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="295.7" y="2946.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Community_visibility" value="visibility" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="275.3" y="2837.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Community_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="422.5" y="2799.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ForumPost_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="858.8" y="2870.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ForumPost_authorId" value="authorId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="907.8" y="2808.9" width="97.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ForumPost_communityId" value="communityId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="987.0" y="2767.9" width="121.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ForumPost_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1114.0" y="2753.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ForumPost_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1213.9" y="2767.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ForumComment_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1162.4" y="3799.5" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ForumComment_postId" value="postId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1074.4" y="3767.9" width="85.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ForumComment_parentCommentId" value="parentCommentId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="965.0" y="3720.9" width="150.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ForumComment_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="973.3" y="3662.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ContentReport_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="609.3" y="3643.5" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ContentReport_reporterId" value="reporterId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="436.7" y="3662.0" width="105.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ContentReport_reason" value="reason" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="388.8" y="3560.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ContentReport_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="519.1" y="3495.1" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_CreditTransaction_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="500.9" y="784.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_CreditTransaction_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="548.9" y="721.8" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_CreditTransaction_action" value="action" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="646.0" y="681.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_CreditTransaction_amount" value="amount" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="742.9" y="671.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_CreditTransaction_idempotencyKey" value="idempotencyKey" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="817.8" y="693.2" width="117.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_CreditTransaction_refundedTransactionId" value="refundedTransactionId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="881.7" y="743.0" width="175.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaymentOrder_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1294.3" y="1339.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaymentOrder_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1132.9" y="1298.7" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaymentOrder_orderCode" value="orderCode" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1119.2" y="1183.3" width="85.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaymentOrder_amount" value="amount" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1272.4" y="1126.5" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaymentOrder_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1408.1" y="1193.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Notification_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="602.1" y="1798.2" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Notification_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="431.5" y="1752.8" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Notification_type" value="type" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="470.7" y="1632.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Notification_isRead" value="isRead" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="639.9" y="1622.1" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AuditLog_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="626.8" y="2310.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AuditLog_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="422.1" y="2242.1" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AuditLog_actionName" value="actionName" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="595.3" y="2150.3" width="92.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_UserAiConnection_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1387.9" y="2386.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_UserAiConnection_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1174.3" y="2330.9" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_UserAiConnection_provider" value="provider" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1343.3" y="2227.7" width="71.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="R06_attr_position" value="position" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4628.2" y="724.1" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R06_attr_isCorresponding" value="isCorresponding" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4772.9" y="668.8" width="117.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R08_attr_confidence" value="confidence" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4706.2" y="953.7" width="86.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R08_attr_isPrimary" value="isPrimary" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4781.5" y="1104.0" width="77.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R11_attr_kind" value="kind" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3014.7" y="731.4" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R11_attr_position" value="position" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2933.4" y="667.5" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R13_attr_position" value="position" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3868.3" y="665.6" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R16_attr_kind" value="kind" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3546.5" y="920.7" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R28_attr_role" value="role" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3763.7" y="2066.3" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R28_attr_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3885.6" y="2165.0" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R29_attr_screeningStatus" value="screeningStatus" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4467.2" y="1394.7" width="114.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R29_attr_readingStatus" value="readingStatus" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4376.1" y="1558.3" width="102.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R53_attr_role" value="role" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1946.8" y="2420.7" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R53_attr_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1865.4" y="2407.4" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```
