import View from './view';
import { useSchemaForm, type SchemaFormProps } from './model';

export type { SchemaFormProps, SchemaOption, SchemaFormValue, OptionsFor } from './model';

export default function SchemaForm(ownProps: SchemaFormProps) {
    const props = useSchemaForm(ownProps);
    return <View {...props} />;
}
