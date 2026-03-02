using FluentValidation;
namespace Api.Features.Staff.Create;

public class CreateStaffValidator : AbstractValidator<CreateStaffCommand>
{
    public CreateStaffValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Role)
            .Must(r => r is "Admin" or "Staff")
            .WithMessage("Role must be 'Admin' or 'Staff'");
        RuleFor(x => x.BuId).NotEmpty();
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}
