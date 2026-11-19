# Overall Logical ERD - Source (draw.io XML)

Project: **LumiGap**. Notation: **Chen ERD**. Version: **1.2**. Code baseline: `main` ca5280c.

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
- `E_<Entity>`: entity rectangles (`rounded=0`, fill `#DAE8FC`). A weak entity uses `shape=ext;double=1` (double rectangle).
- `R<nn>`: relationship diamonds (`rhombus`, fill `#FFF2CC`). The label holds the verb, the cardinality and, for N:M, the join table in brackets. An identifying relationship uses `rhombus;double=1` (double diamond).
- A partial key oval carries an HTML label with `text-decoration: underline dashed`.
- `A_<Entity>_<attribute>`: attribute ovals (`ellipse`, fill `#E2F0D9`). A PK oval uses `fontStyle=5` (bold + underline) and fill `#B9E0A5`. An FK oval is labelled `(FK)` and set in italics.
- `R<nn>_attr_<name>`: attributes of an N:M relationship (columns of the join table).
- `R<nn>_a` and `R<nn>_b`: lines from each entity to its diamond. The red label (`1`, `N`, `M`) is the cardinality next to the entity. Total participation lines use `shape=link` (double line); partial participation lines are single.
- `ae_*` and `R<nn>_ae_*`: thin green lines that attach attributes.

| Cell type | Count |
|---|---|
| header/legend/root | 30 |
| zone | 8 |
| relationship line | 150 |
| attribute line | 175 |
| entity | 39 |
| weak entity | 2 |
| relationship | 75 |
| attribute | 175 |

## Full XML source (2030 lines)

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
          <mxGeometry x="3300.0" y="14.0" width="2240.0" height="236.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg8_line" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="lg8a" target="lg8b">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="lg9_line" value="" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="lg9a" target="lg9b">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R00_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R00">
          <mxGeometry x="-0.438" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R00_b" value="1" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AcademicProfile" target="R00">
          <mxGeometry x="-0.438" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R01_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AcademicProfile" target="R01">
          <mxGeometry x="-0.412" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R01_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AcademicExternalIdentity" target="R01">
          <mxGeometry x="-0.412" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R02_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R02">
          <mxGeometry x="-0.169" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R02_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Affiliation" target="R02">
          <mxGeometry x="-0.729" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R03_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Institution" target="R03">
          <mxGeometry x="-0.418" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R03_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Affiliation" target="R03">
          <mxGeometry x="-0.418" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R04_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R04">
          <mxGeometry x="-0.719" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R04_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_VerificationEvidence" target="R04">
          <mxGeometry x="-0.598" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R05_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AcademicProfile" target="R05">
          <mxGeometry x="-0.636" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R05_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_VerificationEvidence" target="R05">
          <mxGeometry x="-0.872" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R06_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R06">
          <mxGeometry x="-0.701" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R06_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_PaperAuthor" target="R06">
          <mxGeometry x="-0.689" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R07_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Author" target="R07">
          <mxGeometry x="-0.341" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R07_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_PaperAuthor" target="R07">
          <mxGeometry x="-0.292" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R08_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Journal" target="R08">
          <mxGeometry x="-0.487" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R08_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R08">
          <mxGeometry x="-0.487" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R09_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R09">
          <mxGeometry x="-0.638" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R09_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_PaperTopic" target="R09">
          <mxGeometry x="-0.616" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R10_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchTopic" target="R10">
          <mxGeometry x="-0.271" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R10_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_PaperTopic" target="R10">
          <mxGeometry x="-0.211" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R11_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchTopic" target="R11">
          <mxGeometry x="-0.719" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="5280.0" y="1040.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R11_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchTopic" target="R11">
          <mxGeometry x="-0.687" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="5440.0" y="1210.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R12_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R12">
          <mxGeometry x="-0.85" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R12_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R12">
          <mxGeometry x="-0.94" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R13_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R13">
          <mxGeometry x="-0.915" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R13_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R13">
          <mxGeometry x="-0.941" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R14_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R14">
          <mxGeometry x="-0.908" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R14_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R14">
          <mxGeometry x="-0.908" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R15_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R15">
          <mxGeometry x="-0.828" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R15_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R15">
          <mxGeometry x="-0.828" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R16_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R16">
          <mxGeometry x="-0.781" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R16_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R16">
          <mxGeometry x="-0.781" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R17_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R17">
          <mxGeometry x="-0.82" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R17_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R17">
          <mxGeometry x="-0.82" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R18_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R18">
          <mxGeometry x="-0.888" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R18_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R18">
          <mxGeometry x="-0.888" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R19_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R19">
          <mxGeometry x="-0.819" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R19_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapValidation" target="R19">
          <mxGeometry x="-0.193" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R20_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R20">
          <mxGeometry x="-0.864" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R20_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapValidation" target="R20">
          <mxGeometry x="-0.864" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R21_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R21">
          <mxGeometry x="-0.951" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R21_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R21">
          <mxGeometry x="-0.916" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R22_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R22">
          <mxGeometry x="-0.865" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="760.0" y="1120.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R22_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R22">
          <mxGeometry x="-0.857" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="430.0" y="860.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R23_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R23">
          <mxGeometry x="-0.885" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R23_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R23">
          <mxGeometry x="-0.885" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R24_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_CreditTransaction" target="R24">
          <mxGeometry x="-0.941" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R24_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R24">
          <mxGeometry x="-0.941" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R25_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R25">
          <mxGeometry x="-0.91" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R25_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_PaymentOrder" target="R25">
          <mxGeometry x="-0.91" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R26_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R26">
          <mxGeometry x="-0.946" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R26_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Notification" target="R26">
          <mxGeometry x="-0.905" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R27_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R27">
          <mxGeometry x="-0.945" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R27_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AuditLog" target="R27">
          <mxGeometry x="-0.904" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R28_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R28">
          <mxGeometry x="-0.91" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R28_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_UserAiConnection" target="R28">
          <mxGeometry x="-0.853" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R29_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R29">
          <mxGeometry x="-0.908" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R29_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R29">
          <mxGeometry x="-0.908" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R30_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R30">
          <mxGeometry x="-0.919" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R30_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R30">
          <mxGeometry x="-0.893" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R31_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R31">
          <mxGeometry x="-0.862" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R31_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R31">
          <mxGeometry x="-0.862" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R32_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R32">
          <mxGeometry x="-0.95" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R32_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R32">
          <mxGeometry x="-0.95" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R33_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R33">
          <mxGeometry x="-0.923" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R33_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_GapAnalysis" target="R33">
          <mxGeometry x="-0.923" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R34_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R34">
          <mxGeometry x="-0.74" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R34_b" value="1" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchPlan" target="R34">
          <mxGeometry x="-0.74" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R35_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R35">
          <mxGeometry x="-0.76" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R35_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ProjectTask" target="R35">
          <mxGeometry x="-0.76" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R36_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R36">
          <mxGeometry x="-0.814" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R36_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorshipRequest" target="R36">
          <mxGeometry x="-0.814" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R37_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R37">
          <mxGeometry x="-0.916" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R37_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorshipRequest" target="R37">
          <mxGeometry x="-0.894" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R38_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorshipRequest" target="R38">
          <mxGeometry x="-0.79" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R38_b" value="1" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorRelationship" target="R38">
          <mxGeometry x="-0.79" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R39_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R39">
          <mxGeometry x="-0.902" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R39_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_MentorRelationship" target="R39">
          <mxGeometry x="-0.902" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R40_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R40">
          <mxGeometry x="-0.843" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R40_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_RecruitmentOpening" target="R40">
          <mxGeometry x="-0.843" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R41_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_RecruitmentOpening" target="R41">
          <mxGeometry x="-0.59" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R41_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_RecruitmentApplication" target="R41">
          <mxGeometry x="-0.59" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R42_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R42">
          <mxGeometry x="-0.931" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R42_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_RecruitmentApplication" target="R42">
          <mxGeometry x="-0.955" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R43_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R43">
          <mxGeometry x="-0.875" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R43_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_DraftWorkspace" target="R43">
          <mxGeometry x="-0.875" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R44_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R44">
          <mxGeometry x="-0.853" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R44_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R44">
          <mxGeometry x="-0.957" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R45_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Report" target="R45">
          <mxGeometry x="-0.964" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1720.0" y="470.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R45_b" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R45">
          <mxGeometry x="-0.953" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1720.0" y="2880.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R46_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R46">
          <mxGeometry x="-0.811" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R46_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_SubmissionRevision" target="R46">
          <mxGeometry x="-0.811" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R47_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R47">
          <mxGeometry x="-0.1" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R47_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_AiPreReview" target="R47">
          <mxGeometry x="-0.1" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R48_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R48">
          <mxGeometry x="-0.608" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R48_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewRequest" target="R48">
          <mxGeometry x="-0.608" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R49_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_SubmissionRevision" target="R49">
          <mxGeometry x="-0.612" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R49_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewRequest" target="R49">
          <mxGeometry x="-0.633" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R50_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewRequest" target="R50">
          <mxGeometry x="-0.641" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R50_b" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewerAssignment" target="R50">
          <mxGeometry x="-0.615" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R51_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R51">
          <mxGeometry x="-0.899" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R51_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewerAssignment" target="R51">
          <mxGeometry x="-0.899" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R52_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewerAssignment" target="R52">
          <mxGeometry x="-0.707" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R52_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_HumanReview" target="R52">
          <mxGeometry x="-0.898" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R53_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewTemplate" target="R53">
          <mxGeometry x="-0.871" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R53_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewTemplateVersion" target="R53">
          <mxGeometry x="-0.865" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R54_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewTemplateVersion" target="R54">
          <mxGeometry x="-0.413" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R54_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewRequest" target="R54">
          <mxGeometry x="-0.805" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R55_a" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R55">
          <mxGeometry x="-0.909" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R55_b" value="M" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Community" target="R55">
          <mxGeometry x="-0.955" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R56_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Community" target="R56">
          <mxGeometry x="-0.713" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R56_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R56">
          <mxGeometry x="-0.713" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R57_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R57">
          <mxGeometry x="-0.921" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R57_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R57">
          <mxGeometry x="-0.921" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R58_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R58">
          <mxGeometry x="-0.74" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R58_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R58">
          <mxGeometry x="-0.74" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R59_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R59">
          <mxGeometry x="-0.847" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1300.0" y="3830.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R59_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R59">
          <mxGeometry x="-0.837" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1600.0" y="3600.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R60_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R60">
          <mxGeometry x="-0.933" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R60_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R60">
          <mxGeometry x="-0.933" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R61_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R61">
          <mxGeometry x="-0.813" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R61_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ContentReport" target="R61">
          <mxGeometry x="-0.813" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R62_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R62">
          <mxGeometry x="-0.694" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R62_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ContentReport" target="R62">
          <mxGeometry x="-0.694" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R63_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_User" target="R63">
          <mxGeometry x="-0.958" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R63_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ContentReport" target="R63">
          <mxGeometry x="-0.929" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R64_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R64">
          <mxGeometry x="-0.943" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R64_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R64">
          <mxGeometry x="-0.943" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R65_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Paper" target="R65">
          <mxGeometry x="-0.966" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="4080.0" y="930.0"/>
              <mxPoint x="4080.0" y="1420.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R65_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R65">
          <mxGeometry x="-0.975" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1640.0" y="2720.0"/>
              <mxPoint x="1640.0" y="1420.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R66_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R66">
          <mxGeometry x="-0.961" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="4200.0" y="2580.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R66_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R66">
          <mxGeometry x="-0.964" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1560.0" y="2580.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R67_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumComment" target="R67">
          <mxGeometry x="-0.807" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R67_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ForumPost" target="R67">
          <mxGeometry x="-0.798" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R68_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_SubmissionRevision" target="R68">
          <mxGeometry x="-0.742" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R68_b" value="N" style="shape=link;width=5;endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.2;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_HumanReview" target="R68">
          <mxGeometry x="-0.742" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R69_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewTemplateVersion" target="R69">
          <mxGeometry x="-0.467" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R69_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_HumanReview" target="R69">
          <mxGeometry x="-0.547" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R70_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_SubmissionRevision" target="R70">
          <mxGeometry x="-0.836" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R70_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Submission" target="R70">
          <mxGeometry x="-0.815" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R71_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Institution" target="R71">
          <mxGeometry x="-0.84" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R71_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_VerificationEvidence" target="R71">
          <mxGeometry x="-0.339" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R72_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_VerificationEvidence" target="R72">
          <mxGeometry x="-0.698" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="3450.0" y="2390.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R72_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_VerificationEvidence" target="R72">
          <mxGeometry x="-0.636" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="3280.0" y="2250.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R73_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R73">
          <mxGeometry x="-0.927" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R73_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ReviewTemplate" target="R73">
          <mxGeometry x="-0.923" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="3880.0" y="3500.0"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="R74_a" value="1" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_Project" target="R74">
          <mxGeometry x="-0.925" relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R74_b" value="N" style="endArrow=none;html=1;rounded=0;strokeColor=#4D4D4D;strokeWidth=1.5;fontFamily=Helvetica;fontSize=15;fontStyle=1;fontColor=#B20000;labelBackgroundColor=#FFFFFF;" edge="1" parent="1" source="E_ResearchGap" target="R74">
          <mxGeometry x="-0.925" relative="1" as="geometry"/>
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
        <mxCell id="ae_PaperAuthor_position" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaperAuthor" target="A_PaperAuthor_position">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaperAuthor_displayName" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaperAuthor" target="A_PaperAuthor_displayName">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaperAuthor_isCorresponding" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaperAuthor" target="A_PaperAuthor_isCorresponding">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaperAuthor_authorId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaperAuthor" target="A_PaperAuthor_authorId">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaperTopic_position" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaperTopic" target="A_PaperTopic_position">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaperTopic_topicName" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaperTopic" target="A_PaperTopic_topicName">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaperTopic_confidence" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaperTopic" target="A_PaperTopic_confidence">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="ae_PaperTopic_topicId" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="E_PaperTopic" target="A_PaperTopic_topicId">
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
        <mxCell id="R13_ae_kind" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R13" target="R13_attr_kind">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R13_ae_position" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R13" target="R13_attr_position">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R15_ae_position" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R15" target="R15_attr_position">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R18_ae_kind" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R18" target="R18_attr_kind">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R30_ae_role" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R30" target="R30_attr_role">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R30_ae_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R30" target="R30_attr_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R31_ae_screeningStatus" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R31" target="R31_attr_screeningStatus">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R31_ae_readingStatus" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R31" target="R31_attr_readingStatus">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R55_ae_role" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R55" target="R55_attr_role">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="R55_ae_status" value="" style="endArrow=none;html=1;rounded=0;strokeColor=#82B366;strokeWidth=1;" edge="1" parent="1" source="R55" target="R55_attr_status">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="hdr_title" value="OVERALL LOGICAL ENTITY RELATIONSHIP DIAGRAM" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=40;" vertex="1" parent="1">
          <mxGeometry x="100.0" y="52.0" width="2800.0" height="56.0" as="geometry"/>
        </mxCell>
        <mxCell id="hdr_meta" value="PROJECT: LumiGap - An Intelligent Research Gap Discovery and Academic Collaboration Platform&lt;br&gt;NOTATION: CHEN ERD     VERSION: 1.2     SOURCE: Prisma schema + SQL migrations, main ca5280c (39 strong + 2 weak entities, 8 domains)" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=18;" vertex="1" parent="1">
          <mxGeometry x="100.0" y="125.0" width="2800.0" height="90.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg0" value="Entity" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="3430.0" y="57.0" width="120.0" height="38.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt0" value="Rectangle = Entity" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3310.0" y="101.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg1" value="Weak entity" style="shape=ext;double=1;margin=5;rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="3865.0" y="56.0" width="130.0" height="40.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt1" value="Double rectangle = Weak entity" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3750.0" y="101.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg2" value="relation&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4310.0" y="50.0" width="120.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt2" value="Diamond = Relationship" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4190.0" y="101.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg3" value="identifying" style="rhombus;double=1;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4745.0" y="49.0" width="130.0" height="54.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt3" value="Double diamond = Identifying rel." style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4630.0" y="101.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg4" value="attribute" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5195.0" y="60.0" width="110.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt4" value="Oval = Attribute" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="5070.0" y="101.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg5" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3445.0" y="148.0" width="90.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt5" value="Underlined = Primary key" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3310.0" y="189.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg6" value="&lt;span style=&quot;text-decoration: underline dashed;&quot;&gt;position&lt;/span&gt;" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3880.0" y="148.0" width="100.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt6" value="Dashed underline = Partial key" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3750.0" y="189.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg7" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4305.0" y="148.0" width="130.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt7" value="(FK) = Foreign key" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4190.0" y="189.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg8a" value="" style="point;strokeColor=none;fillColor=none;size=1;" vertex="1" parent="1">
          <mxGeometry x="4739.0" y="163.0" width="2.0" height="2.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg8b" value="" style="point;strokeColor=none;fillColor=none;size=1;" vertex="1" parent="1">
          <mxGeometry x="4879.0" y="163.0" width="2.0" height="2.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt8" value="Single line = Partial participation" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4630.0" y="189.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg9a" value="" style="point;strokeColor=none;fillColor=none;size=1;" vertex="1" parent="1">
          <mxGeometry x="5179.0" y="163.0" width="2.0" height="2.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg9b" value="" style="point;strokeColor=none;fillColor=none;size=1;" vertex="1" parent="1">
          <mxGeometry x="5319.0" y="163.0" width="2.0" height="2.0" as="geometry"/>
        </mxCell>
        <mxCell id="lgt9" value="Double line = Total participation" style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="5070.0" y="189.0" width="360.0" height="22.0" as="geometry"/>
        </mxCell>
        <mxCell id="lg_card" value="Cardinality (red, next to each entity): 1:1, 1:N, N:M.  N:M diamonds name the join table in [brackets]; their attributes hang off the diamond." style="text;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontColor=#1A1A1A;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3320.0" y="218.0" width="2200.0" height="20.0" as="geometry"/>
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
          <mxGeometry x="3360.0" y="2224.0" width="180.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Paper" value="Paper" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="4250.0" y="904.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Author" value="Author" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="5200.0" y="444.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Journal" value="Journal" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="4170.0" y="1274.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ResearchTopic" value="ResearchTopic" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="5200.0" y="1184.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_PaperAuthor" value="PaperAuthor" style="shape=ext;double=1;margin=5;rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="4733.0" y="529.0" width="174.0" height="62.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_PaperTopic" value="PaperTopic" style="shape=ext;double=1;margin=5;rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="4733.0" y="1169.0" width="174.0" height="62.0" as="geometry"/>
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
          <mxGeometry x="5159.0" y="2724.0" width="182.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_RecruitmentApplication" value="RecruitmentApplication" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="5149.0" y="3174.0" width="202.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_DraftWorkspace" value="DraftWorkspace" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3440.0" y="2694.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_Submission" value="Submission" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2370.0" y="2854.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_SubmissionRevision" value="SubmissionRevision" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3210.0" y="3224.0" width="180.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_AiPreReview" value="AiPreReview" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2220.0" y="3074.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ReviewRequest" value="ReviewRequest" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2570.0" y="3274.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ReviewerAssignment" value="ReviewerAssignment" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="1907.5" y="3254.0" width="185.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_HumanReview" value="HumanReview" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2870.0" y="3774.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ReviewTemplate" value="ReviewTemplate" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="3540.0" y="3474.0" width="160.0" height="52.0" as="geometry"/>
        </mxCell>
        <mxCell id="E_ReviewTemplateVersion" value="ReviewTemplateVersion" style="rounded=0;fillColor=#DAE8FC;strokeColor=#6C8EBF;strokeWidth=2;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=15;" vertex="1" parent="1">
          <mxGeometry x="2247.5" y="3774.0" width="205.0" height="52.0" as="geometry"/>
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
          <mxGeometry x="3076.0" y="2127.0" width="163.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R05" value="supports&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2936.0" y="1825.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R06" value="lists author&lt;br&gt;(1:N)" style="rhombus;double=1;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4505.0" y="707.0" width="140.0" height="76.0" as="geometry"/>
        </mxCell>
        <mxCell id="R07" value="is credited as&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4981.5" y="482.0" width="137.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R08" value="publishes&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4231.0" y="1082.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R09" value="has topic&lt;br&gt;(1:N)" style="rhombus;double=1;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4510.0" y="1027.0" width="130.0" height="76.0" as="geometry"/>
        </mxCell>
        <mxCell id="R10" value="classifies&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4991.0" y="1172.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R11" value="is parent of&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="5378.0" y="1007.0" width="124.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R12" value="requests report&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2531.0" y="1543.0" width="148.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R13" value="cites&lt;br&gt;(N:M)&lt;br&gt;[ReportPaper]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2989.6" y="617.2" width="152.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R14" value="runs analysis&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3006.5" y="1272.0" width="137.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R15" value="analyzes&lt;br&gt;(N:M)&lt;br&gt;[GapAnalysisPaper]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3749.5" y="699.0" width="181.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R16" value="produces&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3016.0" y="787.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R17" value="suggests&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2416.0" y="742.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R18" value="grounded in&lt;br&gt;(N:M)&lt;br&gt;[ResearchGapPaper]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3471.0" y="959.0" width="188.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R19" value="receives vote&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2228.5" y="1117.0" width="135.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R20" value="validates&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2381.0" y="1582.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R21" value="has ledger entry&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1458.2" y="1279.2" width="154.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R22" value="refunds&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="371.0" y="1087.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R23" value="charges report&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1383.0" y="632.0" width="144.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R24" value="charges analysis&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1976.0" y="677.0" width="158.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R25" value="places order&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1984.5" y="1617.0" width="131.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R26" value="receives&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1377.0" y="1812.4" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R27" value="performs&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1377.0" y="2141.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R28" value="configures&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1870.0" y="2185.0" width="120.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R29" value="owns&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3621.0" y="2007.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R30" value="is member of&lt;br&gt;(N:M)&lt;br&gt;[ProjectMember]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3698.0" y="1904.0" width="164.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R31" value="collects&lt;br&gt;(N:M)&lt;br&gt;[ProjectPaper]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4368.5" y="1434.0" width="153.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R32" value="scopes report&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3285.5" y="1217.0" width="139.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R33" value="scopes analysis&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3878.5" y="1262.0" width="153.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R34" value="has plan&lt;br&gt;(1:1)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4846.0" y="1862.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R35" value="contains&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4846.0" y="2157.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R36" value="requests mentor&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4327.5" y="2392.0" width="155.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R37" value="is invited as mentor&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3509.0" y="2440.5" width="177.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R38" value="becomes&lt;br&gt;(1:1)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4316.0" y="3147.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R39" value="is mentored in&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4458.0" y="2752.0" width="144.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R40" value="opens&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="4846.0" y="2357.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R41" value="receives application&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="5161.0" y="2942.0" width="178.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R42" value="applies&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3721.0" y="2477.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R43" value="drafts in&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3981.0" y="2342.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R44" value="submits&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3973.5" y="2209.5" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R45" value="is submitted as&lt;br&gt;(1:1)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1645.5" y="2017.0" width="149.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R46" value="has revision&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2810.0" y="3032.0" width="130.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R47" value="is pre-reviewed by&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2291.5" y="2957.0" width="167.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R48" value="requests review&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2474.5" y="3057.0" width="151.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R49" value="is reviewed in&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2905.0" y="3242.0" width="140.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R50" value="assigns&lt;br&gt;(1:1)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2266.0" y="3257.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R51" value="reviews as&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2340.5" y="2632.0" width="119.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R52" value="produces round&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2208.5" y="3403.0" width="153.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R53" value="has version&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2922.0" y="3617.0" width="126.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R54" value="is used by&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2381.0" y="3617.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R55" value="joins&lt;br&gt;(N:M)&lt;br&gt;[CommunityMembership]" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1864.5" y="2301.5" width="205.0" height="92.0" as="geometry"/>
        </mxCell>
        <mxCell id="R56" value="hosts&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="726.0" y="2907.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R57" value="authors post&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1909.0" y="2482.0" width="132.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R58" value="has comment&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1156.0" y="3257.0" width="138.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R59" value="replies to&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1541.0" y="3797.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R60" value="writes comment&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1973.5" y="2792.0" width="153.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R61" value="is reported in&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="781.5" y="3257.0" width="137.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R62" value="flags comment&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="852.0" y="3567.0" width="146.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R63" value="files report&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1344.5" y="2978.0" width="121.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R64" value="discusses gap&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1903.5" y="1997.0" width="143.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R65" value="references paper&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2571.5" y="1387.0" width="157.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R66" value="showcases project&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2915.5" y="2547.0" width="169.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R67" value="accepts answer&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1405.5" y="3197.0" width="149.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R68" value="assesses revision&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3043.0" y="3492.0" width="164.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R69" value="follows rubric&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2580.0" y="3767.0" width="140.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R70" value="is current revision of&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="2898.5" y="2847.0" width="183.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R71" value="concerns institution&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3413.5" y="2064.5" width="178.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R72" value="resubmits&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3221.0" y="2357.0" width="118.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R73" value="defines rubric&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3810.0" y="2727.0" width="140.0" height="66.0" as="geometry"/>
        </mxCell>
        <mxCell id="R74" value="scopes gap&lt;br&gt;(1:N)" style="rhombus;fillColor=#FFF2CC;strokeColor=#D6B656;strokeWidth=1.5;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="3617.5" y="1522.0" width="125.0" height="66.0" as="geometry"/>
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
          <mxGeometry x="3063.9" y="1660.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicProfile_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3058.5" y="1698.3" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicProfile_publicHandle" value="publicHandle" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3043.9" y="1735.9" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AcademicProfile_primaryPosition" value="primaryPosition" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3019.5" y="1771.6" width="111.0" height="32.0" as="geometry"/>
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
          <mxGeometry x="3340.5" y="1761.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Affiliation_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3422.2" y="1838.3" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Affiliation_institutionId" value="institutionId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3336.1" y="1921.4" width="114.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Affiliation_verificationStatus" value="verificationStatus" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3196.2" y="1917.2" width="119.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Institution_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3666.6" y="1736.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Institution_name" value="name" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3473.9" y="1575.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Institution_rorId" value="rorId" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3774.5" y="1573.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_VerificationEvidence_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3501.2" y="2157.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_VerificationEvidence_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3551.6" y="2215.8" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_VerificationEvidence_verificationType" value="verificationType" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3524.6" y="2282.6" width="112.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_VerificationEvidence_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3460.1" y="2326.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4010.8" y="883.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_doi" value="doi" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4059.4" y="795.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4154.8" y="732.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_publicationYear" value="publicationYear" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4252.7" y="704.0" width="112.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Paper_journalId" value="journalId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4381.0" y="717.7" width="100.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Author_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5164.7" y="374.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Author_orcid" value="orcid" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5334.4" y="379.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Author_displayName" value="displayName" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5362.4" y="499.0" width="98.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Author_hIndex" value="hIndex" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5213.7" y="549.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Journal_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4289.7" y="1224.1" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Journal_name" value="name" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4307.1" y="1332.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Journal_publisher" value="publisher" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4149.1" y="1350.2" width="77.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchTopic_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5446.5" y="1246.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchTopic_topicName" value="topicName" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5317.8" y="1336.2" width="85.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchTopic_level" value="level" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5161.0" y="1334.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchTopic_parentTopicId" value="parentTopicId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5000.6" y="1243.7" width="127.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaperAuthor_position" value="&lt;span style=&quot;text-decoration: underline dashed;&quot;&gt;position&lt;/span&gt;" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4605.2" y="535.9" width="71.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaperAuthor_displayName" value="displayName" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4644.7" y="454.4" width="98.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaperAuthor_isCorresponding" value="isCorresponding" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4752.0" y="417.9" width="117.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaperAuthor_authorId" value="authorId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4880.9" y="444.7" width="97.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaperTopic_position" value="&lt;span style=&quot;text-decoration: underline dashed;&quot;&gt;position&lt;/span&gt;" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4887.6" y="1250.0" width="71.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaperTopic_topicName" value="topicName" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4790.7" y="1281.8" width="85.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaperTopic_confidence" value="confidence" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4695.5" y="1263.5" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_PaperTopic_topicId" value="topicId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4631.8" y="1204.6" width="88.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1981.1" y="420.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2034.1" y="370.7" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_query" value="query" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2128.3" y="356.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2210.9" y="383.2" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Report_creditCost" value="creditCost" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2254.1" y="440.2" width="81.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3187.5" y="523.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_userId" value="userId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3235.0" y="471.0" width="86.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_topic" value="topic" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3329.2" y="455.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3410.8" y="485.5" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_GapAnalysis_creditCost" value="creditCost" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3443.7" y="545.1" width="81.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2843.7" y="1265.8" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_analysisId" value="analysisId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2732.6" y="1274.3" width="107.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2659.1" y="1258.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_gapType" value="gapType" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2573.8" y="1220.3" width="74.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ResearchGap_validationStatus" value="validationStatus" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2484.0" y="1164.1" width="113.0" height="32.0" as="geometry"/>
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
          <mxGeometry x="5137.2" y="2601.2" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentOpening_projectId" value="projectId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5322.8" y="2618.9" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentOpening_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5415.9" y="2756.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentOpening_capacity" value="capacity" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5280.2" y="2870.3" width="71.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentApplication_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5300.8" y="3085.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentApplication_openingId" value="openingId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5362.0" y="3222.6" width="107.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentApplication_applicantId" value="applicantId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5178.3" y="3300.4" width="112.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_RecruitmentApplication_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="5049.1" y="3199.1" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_DraftWorkspace_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3540.0" y="2773.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_DraftWorkspace_projectId" value="projectId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3417.8" y="2774.5" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_DraftWorkspace_name" value="name" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3366.0" y="2710.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_DraftWorkspace_writingMode" value="writingMode" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3403.1" y="2640.7" width="93.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2335.0" y="2789.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_projectId" value="projectId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2385.5" y="2714.0" width="99.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_sourceReportId" value="sourceReportId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2607.0" y="2714.0" width="136.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_title" value="title" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2510.0" y="2714.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_Submission_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2615.0" y="2909.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_SubmissionRevision_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3179.0" y="3053.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_SubmissionRevision_submissionId" value="submissionId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3514.3" y="3221.5" width="124.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_SubmissionRevision_revisionNumber" value="revisionNumber" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3189.1" y="3421.4" width="113.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AiPreReview_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2394.6" y="3098.3" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AiPreReview_submissionId" value="submissionId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2163.9" y="3157.5" width="124.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_AiPreReview_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2202.2" y="3007.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewRequest_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2810.4" y="3323.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewRequest_submissionId" value="submissionId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2737.7" y="3384.9" width="124.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewRequest_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2672.5" y="3422.4" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewRequest_expiresAt" value="expiresAt" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2575.4" y="3426.4" width="77.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewerAssignment_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2074.2" y="3362.0" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewerAssignment_reviewRequestId" value="reviewRequestId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1815.9" y="3364.2" width="144.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewerAssignment_reviewerId" value="reviewerId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1775.1" y="3212.2" width="109.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewerAssignment_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1996.2" y="3139.9" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_HumanReview_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3025.9" y="3724.1" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_HumanReview_assignmentId" value="assignmentId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3022.6" y="3830.6" width="125.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_HumanReview_roundNumber" value="roundNumber" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2889.7" y="3882.0" width="102.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_HumanReview_recommendation" value="recommendation" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2746.5" y="3817.6" width="118.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplate_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3454.5" y="3473.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplate_name" value="name" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3571.6" y="3395.7" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplate_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3707.6" y="3453.6" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplateVersion_id" value="id" style="ellipse;fillColor=#B9E0A5;strokeColor=#5A9A3C;fontStyle=5;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2546.5" y="3906.2" width="70.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplateVersion_templateId" value="templateId (FK)" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=2;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2039.9" y="3887.8" width="109.0" height="32.0" as="geometry"/>
        </mxCell>
        <mxCell id="A_ReviewTemplateVersion_versionNumber" value="versionNumber" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2273.6" y="3574.1" width="110.0" height="32.0" as="geometry"/>
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
        <mxCell id="R13_attr_kind" value="kind" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2993.7" y="723.0" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R13_attr_position" value="position" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="2912.5" y="659.4" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R15_attr_position" value="position" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3843.2" y="655.6" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R18_attr_kind" value="kind" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3519.9" y="910.8" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R30_attr_role" value="role" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3618.0" y="1913.2" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R30_attr_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="3872.0" y="1913.3" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R31_attr_screeningStatus" value="screeningStatus" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4441.8" y="1374.6" width="114.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R31_attr_readingStatus" value="readingStatus" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="4352.4" y="1558.4" width="102.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R55_attr_role" value="role" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1946.8" y="2420.7" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
        <mxCell id="R55_attr_status" value="status" style="ellipse;fillColor=#E2F0D9;strokeColor=#82B366;fontStyle=0;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="1865.4" y="2407.4" width="70.0" height="30.0" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```
