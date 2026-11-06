# Construction ownership fixtures

These synthetic files were authored for Brickinetic by its contributors and are
available under CC0-1.0. They contain no external geometry dependencies.

Expected ownership follows the construction-unit policy, not a physical brick
count:

| Occurrence                       | Expected unit                               |
| -------------------------------- | ------------------------------------------- |
| Root direct face and two edges   | One residual unit                           |
| Two root references to part.dat  | Two distinct part units                     |
| Part in submodel.ldr             | One part unit                               |
| Part in shortcut.dat             | One part unit                               |
| unknown.ldr direct face          | One residual unit                           |
| Part in unknown.ldr              | One part unit                               |
| nested.dat under each part.dat   | Owned by its containing part unit           |
| construction-standalone.ldr root | One part unit, including its face and edges |

The fixture has seven expected units: five part occurrences and two residual
units. The separate standalone fixture has one expected unit.

`construction-steps.mpd` is also an original CC0-1.0 fixture. Its root has an
implicit first reference, two consecutive STEP commands before the submodel,
and a later STEP before its last part. The submodel has a STEP before an outer
part; that part has a STEP before its nested part. The standalone fixture has
no STEP command. The step observation test records the r186 retained order.
